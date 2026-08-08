import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, stripHtml } from "@/modules/job-finder/sources/source.utils";

/**
 * LinkedIn job-alert emails, read out of the mailboxes this app already syncs.
 *
 * LinkedIn has no public jobs API and scraping their pages breaches their terms,
 * so the supported route is: create job alerts in LinkedIn, point them at a
 * synced mailbox, and parse the digests here.
 *
 * This adapter only *reads* `mail_messages` — it never writes to the mail
 * tables and never marks anything as read.
 *
 * Extraction is LLM-assisted but **URL-anchored**: the model only ever labels
 * job links that were found in the email by regex, and any posting whose URL is
 * not in that set is discarded. A hallucinated link therefore cannot survive.
 */
@Injectable()
export class LinkedInEmailSource implements JobSourceAdapter {
    readonly key = "linkedin-email";
    readonly name = "LinkedIn (job-alert emails)";
    readonly requiresCredentials = false;

    /** Senders LinkedIn uses for job alerts and recruiter mail. */
    private static readonly DEFAULT_SENDERS = ["jobs-noreply@linkedin.com", "jobalerts-noreply@linkedin.com", "@linkedin.com"];

    private static readonly JOB_URL_RE = /https?:\/\/[\w.-]*linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/gi;

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService
    ) {}

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const senders = asStringArray(ctx.config.senders) ?? LinkedInEmailSource.DEFAULT_SENDERS;
        const mailboxId = typeof ctx.config.mailboxId === "string" ? ctx.config.mailboxId : undefined;

        const messages = await this.prisma.mailMessage.findMany({
            where: {
                receivedAt: { gte: ctx.since },
                ...(mailboxId ? { mailboxId } : {}),
                OR: senders.map((sender) => ({ from: { contains: sender } })),
            },
            orderBy: { receivedAt: "desc" },
            take: 50,
            select: { id: true, subject: true, body: true, html: true, receivedAt: true },
        });

        if (!messages.length) {
            await ctx.log("info", "No LinkedIn job-alert emails in the window — set up alerts to a synced mailbox to use this source");
            return [];
        }

        await ctx.log("debug", `Scanning ${messages.length} LinkedIn alert email(s)`);

        const collected: NormalizedPosting[] = [];

        for (const message of messages) {
            const text = stripHtml(message.html) ?? message.body ?? "";
            const links = this.extractJobLinks(`${message.html ?? ""}\n${message.body ?? ""}`);

            if (!links.size) continue;

            if (!this.llm.isConfigured()) {
                await ctx.log("warn", "LLM unavailable — LinkedIn emails can be read but not parsed into postings");
                return collected;
            }

            try {
                const postings = await this.parseDigest(text, [...links.values()], message.receivedAt);
                collected.push(...postings);
            } catch (err) {
                await ctx.log("warn", `Could not parse a LinkedIn digest: ${(err as Error).message}`, {
                    messageId: message.id,
                });
            }
        }

        await ctx.log("debug", `LinkedIn emails yielded ${collected.length} postings`);
        return collected;
    }

    /** Canonical job URL per LinkedIn job id, dropping tracking query strings. */
    private extractJobLinks(raw: string): Map<string, string> {
        const links = new Map<string, string>();
        for (const match of raw.matchAll(LinkedInEmailSource.JOB_URL_RE)) {
            const id = match[1];
            if (!links.has(id)) links.set(id, `https://www.linkedin.com/jobs/view/${id}`);
        }
        return links;
    }

    private async parseDigest(text: string, urls: string[], receivedAt: Date): Promise<NormalizedPosting[]> {
        const { value } = await this.llm.completeJson<{ jobs?: ParsedJob[] }>(
            [
                {
                    role: "system",
                    content:
                        "You extract job postings from a LinkedIn job-alert email.\n\n" +
                        "You are given the email text and the list of job URLs that were found in it.\n" +
                        "Return ONLY jobs you can attribute to one of those URLs. Never invent a URL, a " +
                        "company, or a title. If the email does not make a job's company clear, omit that job.\n\n" +
                        'Reply with JSON: { "jobs": [{ "url": "<one of the given URLs>", "title": "", ' +
                        '"company": "", "location": "", "isRemote": true|false }] }',
                },
                {
                    role: "user",
                    content: `Job URLs found in the email:\n${urls.join("\n")}\n\nEmail text:\n${clampText(text, 20_000)}`,
                },
            ],
            { temperature: 0, maxTokens: 4000 }
        );

        const allowed = new Set(urls);

        return (value.jobs ?? [])
            // Drop anything the model attached to a URL that was not in the email.
            .filter((job) => job?.url && allowed.has(job.url) && job.title && job.company)
            .map((job) => ({
                externalId: job.url.split("/").pop(),
                title: job.title.trim(),
                company: job.company.trim(),
                location: job.location?.trim() || undefined,
                isRemote: Boolean(job.isRemote) || /remote/i.test(`${job.title} ${job.location ?? ""}`),
                url: job.url,
                applyUrl: job.url,
                // The digest only carries a teaser; the posting page holds the real JD.
                description: undefined,
                tags: ["linkedin-alert"],
                // Alert emails do not state publish time; the email's arrival is the
                // best available proxy and keeps the row inside the window honestly.
                postedAt: receivedAt,
                raw: { via: "linkedin-alert-email", url: job.url },
            }));
    }
}

function asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const list = value.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
    return list.length ? list : undefined;
}

interface ParsedJob {
    url: string;
    title: string;
    company: string;
    location?: string;
    isRemote?: boolean;
}
