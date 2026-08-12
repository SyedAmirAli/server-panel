import { Injectable, Logger } from "@nestjs/common";
import type { CandidateProfile, JobPosting } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { JOB_MATCH_SYSTEM_PROMPT, renderProfileForMatching } from "@/modules/job-finder/prompts/job-match.prompt";
import { LogFn } from "@/modules/job-finder/sources/job-source.types";
import { clampText } from "@/modules/job-finder/sources/source.utils";

/** Scores postings against the candidate profile, producing the 1–5 star rating. */
@Injectable()
export class JobMatchingService {
    private readonly logger = new Logger(JobMatchingService.name);

    /** Postings scored in parallel. Kept low so a run doesn't hammer the gateway. */
    private static readonly CONCURRENCY = 4;

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService
    ) {}

    /**
     * Score every given posting for one profile.
     *
     * Individual failures are logged and skipped rather than aborting the run —
     * a partially scored batch is far more useful than none.
     */
    async scoreMany(
        postings: JobPosting[],
        profile: CandidateProfile,
        options: { model?: string; log: LogFn }
    ): Promise<{ scored: number; failed: number }> {
        if (!postings.length) return { scored: 0, failed: 0 };

        if (!this.llm.isConfigured()) {
            await options.log("warn", "LLM not configured — postings were saved but left unscored");
            return { scored: 0, failed: postings.length };
        }

        const profileText = renderProfileForMatching(profile);
        let scored = 0;
        let failed = 0;

        const queue = [...postings];
        const workers = Array.from({ length: Math.min(JobMatchingService.CONCURRENCY, queue.length) }, async () => {
            for (;;) {
                const posting = queue.shift();
                if (!posting) return;

                try {
                    const match = await this.scoreOne(posting, profile, profileText, options.model);
                    scored++;
                    await options.log(
                        "info",
                        `${"★".repeat(match.stars)}${"☆".repeat(5 - match.stars)} ${posting.title} — ${posting.company}`,
                        { postingId: posting.id, stars: match.stars, score: match.score }
                    );
                } catch (err) {
                    failed++;
                    this.logger.warn(`Scoring failed for ${posting.id}: ${(err as Error).message}`);
                    await options.log("warn", `Could not score "${posting.title}": ${(err as Error).message}`, {
                        postingId: posting.id,
                    });
                }
            }
        });

        await Promise.all(workers);
        return { scored, failed };
    }

    /** Score one posting and persist the match. */
    async scoreOne(posting: JobPosting, profile: CandidateProfile, profileText?: string, model?: string) {
        const rendered = profileText ?? renderProfileForMatching(profile);

        const { value, result } = await this.llm.completeJson<RawMatch>(
            [
                { role: "system", content: JOB_MATCH_SYSTEM_PROMPT },
                {
                    role: "user",
                    content:
                        `# Candidate profile\n${rendered}\n\n` +
                        `# Job posting\n` +
                        `Title: ${posting.title}\n` +
                        `Company: ${posting.company}\n` +
                        `Location: ${posting.location ?? "not stated"}${posting.isRemote ? " (remote)" : ""}\n` +
                        `Employment type: ${posting.employmentType ?? "not stated"}\n` +
                        `Salary: ${posting.salaryRaw ?? "not stated"}\n\n` +
                        `Description:\n${clampText(posting.description ?? "", 8000) ?? "(no description provided)"}`,
                },
            ],
            { temperature: 0, maxTokens: 2500, model }
        );

        const stars = clampInt(value.stars, 1, 5, 1);
        const score = clampInt(value.score, 0, 100, starToScore(stars));

        const data = {
            stars,
            score,
            verdict: normalizeVerdict(value.verdict, stars),
            summary: str(value.summary),
            strengths: strArray(value.strengths),
            gaps: strArray(value.gaps),
            matchedSkills: strArray(value.matchedSkills),
            missingSkills: strArray(value.missingSkills),
            model: result.model,
            scoredAt: new Date(),
        };

        const match = await this.prisma.jobMatch.upsert({
            where: { postingId_profileId: { postingId: posting.id, profileId: profile.id } },
            update: data,
            create: { postingId: posting.id, profileId: profile.id, ...data },
        });

        // "new" → "scored"; never clobber a decision the user has already made
        // (shortlisted / applied / dismissed / archived).
        if (posting.status === "new") {
            await this.prisma.jobPosting.update({ where: { id: posting.id }, data: { status: "scored" } });
        }

        return match;
    }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === "string" ? Number(value) : (value as number);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

/** Midpoint of the star's score band, used when the model omits `score`. */
function starToScore(stars: number): number {
    return [10, 30, 50, 70, 90][stars - 1] ?? 50;
}

function normalizeVerdict(value: unknown, stars: number): string {
    const allowed = ["strong", "good", "stretch", "weak"];
    const raw = typeof value === "string" ? value.toLowerCase().trim() : "";
    if (allowed.includes(raw)) return raw;
    if (stars >= 5) return "strong";
    if (stars === 4) return "good";
    if (stars === 3) return "stretch";
    return "weak";
}

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map((v) => v.trim());
}

interface RawMatch {
    stars?: number;
    score?: number;
    verdict?: string;
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    matchedSkills?: string[];
    missingSkills?: string[];
}
