import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CandidateProfile, JobPosting } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { APPLICATION_EMAIL_SYSTEM_PROMPT } from "@/modules/job-finder/prompts/application-email.prompt";
import { renderProfileForMatching } from "@/modules/job-finder/prompts/job-match.prompt";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { CandidateProfileService } from "@/modules/job-finder/services/candidate-profile.service";
import { clampText } from "@/modules/job-finder/sources/source.utils";

/**
 * Drafts application emails.
 *
 * Drafts are stored, never sent — sending stays a deliberate act by the user
 * (the CV still has to be attached), which also keeps this module clear of the
 * existing mail-send pipeline.
 */
@Injectable()
export class JobApplicationService {
    private readonly logger = new Logger(JobApplicationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService,
        private readonly settings: JobFinderSettingsService,
        private readonly profiles: CandidateProfileService
    ) {}

    async listForPosting(postingId: string) {
        return this.prisma.jobApplication.findMany({
            where: { postingId },
            orderBy: { createdAt: "desc" },
        });
    }

    async getOne(id: string) {
        const application = await this.prisma.jobApplication.findUnique({
            where: { id },
            include: { posting: true },
        });
        if (!application) throw new NotFoundException("Application not found");
        return application;
    }

    /** Generate (or regenerate) a draft for one posting. */
    async generate(postingId: string) {
        const posting = await this.prisma.jobPosting.findUnique({
            where: { id: postingId },
            include: { matches: { orderBy: { scoredAt: "desc" }, take: 1 } },
        });
        if (!posting) throw new NotFoundException("Job posting not found");

        const profile = await this.profiles.getActive();
        if (!profile) {
            throw new BadRequestException("No candidate profile — import your resume before drafting applications.");
        }
        if (!this.llm.isConfigured()) {
            throw new BadRequestException("Drafting needs an LLM. Set AI_BASE_URL and AI_API_KEY, then retry.");
        }

        const settings = await this.settings.get();
        const draft = await this.draft(posting, profile, settings.writingModel);

        if (!draft.shouldApply) {
            throw new BadRequestException(
                `This role is too much of a stretch to be worth your time. ${draft.gapsNote ?? ""}`.trim()
            );
        }

        const { body, stripped } = this.enforceNoLinks(draft.body, profile.email);

        // If the safety net had to fire, say so rather than quietly handing over
        // prose that may now read oddly around the removal.
        const gapsNote = [
            stripped
                ? "Note: a link was removed from the body automatically — reread that sentence before sending."
                : null,
            draft.gapsNote,
        ]
            .filter(Boolean)
            .join(" ");

        return this.prisma.jobApplication.create({
            data: {
                postingId: posting.id,
                profileId: profile.id,
                status: "draft",
                channel: posting.applyEmail ? "email" : "url",
                toEmail: posting.applyEmail,
                subject: draft.subject,
                body,
                gapsNote: gapsNote || null,
                model: draft.model,
            },
        });
    }

    /** Hand-edit a draft before sending. */
    async update(id: string, data: { subject?: string; body?: string; toEmail?: string; status?: string }) {
        await this.getOne(id);
        return this.prisma.jobApplication.update({
            where: { id },
            data: {
                ...(data.subject !== undefined && { subject: data.subject }),
                ...(data.body !== undefined && { body: data.body }),
                ...(data.toEmail !== undefined && { toEmail: data.toEmail }),
                ...(data.status !== undefined && { status: data.status }),
            },
        });
    }

    /**
     * Record that an application went out. This does not send anything — it
     * marks the draft and flips the posting to "applied".
     */
    async markSent(id: string, sentMessageId?: string) {
        const application = await this.getOne(id);
        const [updated] = await this.prisma.$transaction([
            this.prisma.jobApplication.update({
                where: { id },
                data: { status: "sent", sentAt: new Date(), sentMessageId: sentMessageId ?? null },
            }),
            this.prisma.jobPosting.update({ where: { id: application.postingId }, data: { status: "applied" } }),
        ]);
        return updated;
    }

    async remove(id: string) {
        await this.getOne(id);
        return this.prisma.jobApplication.delete({ where: { id } });
    }

    private async draft(
        posting: JobPosting & { matches: Array<{ gaps: unknown }> },
        profile: CandidateProfile,
        model: string
    ) {
        // Feeding the scorer's gap list forward keeps the two consistent: the
        // email won't claim something the rating already flagged as unevidenced.
        const knownGaps = Array.isArray(posting.matches[0]?.gaps)
            ? (posting.matches[0].gaps as string[]).join("; ")
            : "";

        const { value, result } = await this.llm.completeJson<RawDraft>(
            [
                { role: "system", content: APPLICATION_EMAIL_SYSTEM_PROMPT },
                {
                    role: "user",
                    content:
                        `# Candidate profile\n${renderProfileForMatching(profile)}\n\n` +
                        `# Job posting\n` +
                        `Title: ${posting.title}\n` +
                        `Company: ${posting.company}\n` +
                        `Location: ${posting.location ?? "not stated"}${posting.isRemote ? " (remote)" : ""}\n\n` +
                        `Description:\n${clampText(posting.description ?? "", 10_000) ?? "(no description provided)"}` +
                        (knownGaps ? `\n\n# Gaps already identified when rating this role\n${knownGaps}` : ""),
                },
            ],
            { temperature: 0.3, maxTokens: 3000, model }
        );

        if (!value?.body || !value?.subject) {
            throw new BadRequestException("The model did not return a usable draft — try again.");
        }

        return {
            shouldApply: value.shouldApply !== false,
            subject: value.subject.trim(),
            body: value.body.trim(),
            gapsNote: typeof value.gapsNote === "string" ? value.gapsNote.trim() : null,
            model: result.model,
        };
    }

    /**
     * The no-links rule is load-bearing, so it is enforced in code rather than
     * trusted to the model: strip URLs and bare domains, keeping only the
     * candidate's own email address in the signature.
     */
    private enforceNoLinks(body: string, candidateEmail: string | null): { body: string; stripped: boolean } {
        // The signature address is the only permitted "link". Park it behind a
        // token with no spaces or punctuation, so none of the rules below —
        // including the whitespace tidying — can damage it.
        const TOKEN = "__CANDIDATE_EMAIL__";
        const parked = candidateEmail ? body.split(candidateEmail).join(TOKEN) : body;

        const TLD = "com|io|dev|net|org|ai|co|app|me|xyz|tech|cloud|sh";

        const stripped = parked
            // Full URLs, including path and query.
            .replace(/\bhttps?:\/\/\S+/gi, "")
            .replace(/\bwww\.[^\s,;)]+/gi, "")
            // Bare domain *with* a path — take the whole token, otherwise
            // removing "github.com" strands a "/SyedAmirAli" fragment.
            .replace(new RegExp(`\\b[a-z0-9-]+\\.(?:${TLD})/[^\\s,;)]*`, "gi"), "")
            // Bare domain, no path: keep the brand, drop the TLD, so
            // "Hubbers.io" becomes "Hubbers" rather than vanishing.
            .replace(new RegExp(`\\b([a-z0-9-]+)\\.(?:${TLD})\\b`, "gi"), "$1");

        const didStrip = stripped !== parked;

        // Excising a link tends to leave a dangling clause ("More at … and ."),
        // so repair line by line — but only when something was actually removed,
        // so untouched prose is never reflowed.
        const repaired = didStrip
            ? stripped
                  .split("\n")
                  .map((line) => {
                      const fixed = line
                          .replace(/[ \t]{2,}/g, " ")
                          .replace(/\b(?:More|Details|Read more|See more)\s+(?:at|on)\b[\s,]*$/i, "")
                          .replace(/\s+(?:and|or)\s*([.,;:])/gi, "$1")
                          .replace(/\s+(?:and|or)\s*$/i, "")
                          .replace(/ +([.,;:])/g, "$1")
                          .replace(/([.,;:])\1+/g, "$1")
                          .trimEnd();
                      // A line reduced to nothing but connectives is dropped.
                      return /^[\s.,;:]*(?:and|or|at|on)?[\s.,;:]*$/i.test(fixed) ? "" : fixed;
                  })
                  .join("\n")
                  .replace(/\n{3,}/g, "\n\n")
            : stripped;

        if (didStrip) {
            this.logger.warn("Stripped one or more links from a generated application body");
        }

        return { body: repaired.split(TOKEN).join(candidateEmail ?? "").trim(), stripped: didStrip };
    }
}

interface RawDraft {
    shouldApply?: boolean;
    subject?: string;
    body?: string;
    gapsNote?: string;
    technologies?: string[];
}
