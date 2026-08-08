import { BadRequestException, Injectable } from "@nestjs/common";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import {
    JOB_FINDER_USER_AGENT,
    clampText,
    findEmail,
    stripHtml,
    toDate,
} from "@/modules/job-finder/sources/source.utils";

/**
 * Import a single posting from any job URL — the catch-all for links that no
 * board API covers (a company careers page, a LinkedIn post someone sent you).
 *
 * Fetches the page, reduces it to text, and has the model normalize it into the
 * standard posting shape. The URL is always the one that was requested: the
 * model labels content, it never supplies the link.
 *
 * Used on-demand via `importUrl()`; also runs as a source when a run's config
 * carries a `urls` list.
 */
@Injectable()
export class UrlImportSource implements JobSourceAdapter {
    readonly key = "url-import";
    readonly name = "URL import";
    readonly requiresCredentials = false;

    constructor(private readonly llm: LlmService) {}

    isReady(): boolean {
        return this.llm.isConfigured();
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const urls = Array.isArray(ctx.config.urls)
            ? ctx.config.urls.filter((u): u is string => typeof u === "string")
            : [];
        if (!urls.length) return [];

        const collected: NormalizedPosting[] = [];
        for (const url of urls.slice(0, ctx.limit)) {
            try {
                collected.push(await this.importUrl(url, ctx.config.extractionModel as string | undefined));
            } catch (err) {
                await ctx.log("warn", `URL import failed for ${url}: ${(err as Error).message}`);
            }
        }
        return collected;
    }

    /** Fetch one job page and normalize it. Throws with a usable message on failure. */
    async importUrl(url: string, model?: string): Promise<NormalizedPosting> {
        const target = this.validateUrl(url);

        if (!this.llm.isConfigured()) {
            throw new BadRequestException("URL import needs an LLM. Set AI_BASE_URL and AI_API_KEY, then retry.");
        }

        const html = await this.fetchPage(target);
        const text = clampText(stripHtml(html), 30_000);

        if (!text || text.length < 200) {
            throw new BadRequestException(
                `Fetched ${target.host} but found almost no readable text — the page is probably JavaScript-rendered or gated. Paste the description manually instead.`
            );
        }

        const { value } = await this.llm.completeJson<ExtractedPosting>(
            [
                {
                    role: "system",
                    content:
                        "You normalize a fetched job page into JSON. Use only what the page states — " +
                        "never invent a company, salary, location or date. Omit fields the page does not give.\n\n" +
                        'Reply with JSON only: { "title": "", "company": "", "location": "", ' +
                        '"isRemote": true|false, "employmentType": "", "salaryRaw": "", ' +
                        '"applyEmail": "", "postedAt": "ISO-8601 or omit", ' +
                        '"tags": [""], "description": "the full job description as plain text" }',
                },
                { role: "user", content: `Page URL: ${target.toString()}\n\nPage text:\n${text}` },
            ],
            { temperature: 0, maxTokens: 8000, model }
        );

        if (!value?.title || !value?.company) {
            throw new BadRequestException(
                `Could not identify a job title and company on ${target.host}. It may not be a job posting page.`
            );
        }

        return {
            title: value.title.trim(),
            company: value.company.trim(),
            location: value.location?.trim() || undefined,
            isRemote: Boolean(value.isRemote) || /remote/i.test(`${value.title} ${value.location ?? ""}`),
            employmentType: value.employmentType?.trim() || undefined,
            salaryRaw: value.salaryRaw?.trim() || undefined,
            // The page is authoritative for the apply address; fall back to a scan.
            applyEmail: value.applyEmail?.trim() || findEmail(text),
            // Always the requested URL — never a model-supplied one.
            url: target.toString(),
            applyUrl: target.toString(),
            description: clampText(value.description?.trim() || text),
            tags: Array.isArray(value.tags) ? value.tags.filter((t) => typeof t === "string") : [],
            postedAt: toDate(value.postedAt),
            raw: { via: "url-import", host: target.host },
        };
    }

    /** Only http(s), and never a private/loopback host — this fetches on request. */
    private validateUrl(raw: string): URL {
        let url: URL;
        try {
            url = new URL(raw.trim());
        } catch {
            throw new BadRequestException(`Not a valid URL: ${raw}`);
        }

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new BadRequestException("Only http(s) URLs can be imported.");
        }

        const host = url.hostname.toLowerCase();
        const isPrivate =
            host === "localhost" ||
            host.endsWith(".localhost") ||
            host.endsWith(".internal") ||
            /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
            host === "[::1]" ||
            host === "::1";

        if (isPrivate) {
            throw new BadRequestException("Refusing to fetch a loopback or private-network address.");
        }

        return url;
    }

    private async fetchPage(url: URL): Promise<string> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": JOB_FINDER_USER_AGENT,
                    Accept: "text/html,application/xhtml+xml",
                },
                redirect: "follow",
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new BadRequestException(
                    `${url.host} returned HTTP ${res.status}. Many boards block automated fetches — paste the description manually instead.`
                );
            }
            return await res.text();
        } catch (err) {
            if (err instanceof BadRequestException) throw err;
            if ((err as Error).name === "AbortError") {
                throw new BadRequestException(`Timed out fetching ${url.host}.`);
            }
            throw new BadRequestException(`Could not fetch ${url.host}: ${(err as Error).message}`);
        } finally {
            clearTimeout(timer);
        }
    }
}

interface ExtractedPosting {
    title?: string;
    company?: string;
    location?: string;
    isRemote?: boolean;
    employmentType?: string;
    salaryRaw?: string;
    applyEmail?: string;
    postedAt?: string;
    tags?: string[];
    description?: string;
}
