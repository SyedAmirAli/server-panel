import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ProfileExperience, ProfileProject } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { RESUME_TAILORING_SYSTEM_PROMPT } from "@/modules/ai-studio/prompts/resume-tailoring.prompt";
import { clampText } from "@/modules/job-finder/sources/source.utils";

export interface TailoringDecision {
    itemId: string;
    itemType: "project" | "experience";
    included: boolean;
    overlapScore: number;
    matchedTags: string[];
    reason: string;
}

export interface TailoringOutput {
    decisions: TailoringDecision[];
    summary: string[];
    rewrittenPoints: Record<string, string[]>;
    unsupportedClaims: string[];
    rejectedTechnologies: string[];
    model: string | null;
}

/** Projects scoring below this are dropped unless nothing else qualifies. */
const MIN_OVERLAP = 1;
/** Keep the resume within two pages: more than this and it always overflows. */
const MAX_PROJECTS = 6;

/**
 * Decides what goes on a resume for a specific job.
 *
 * Two stages on purpose. The deterministic pass is cheap, explainable, and keeps
 * working when the gateway is down — which it does, without warning. The model
 * then refines ordering and wording, but only within what the first pass allows.
 *
 * The rule the whole feature rests on: tailoring may **reorder, reweight,
 * rephrase and select**. It may never **invent**. That is enforced here in code,
 * not left to the prompt.
 */
@Injectable()
export class TailoringService {
    private readonly logger = new Logger(TailoringService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService
    ) {}

    async tailor(profileId: string, postingId: string | null, jobText?: string): Promise<TailoringOutput> {
        const profile = await this.prisma.candidateProfile.findUnique({
            where: { id: profileId },
            include: {
                projectItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                experienceItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                skillItems: true,
            },
        });
        if (!profile) throw new NotFoundException("Person not found");

        const posting = postingId
            ? await this.prisma.jobPosting.findUnique({ where: { id: postingId } })
            : null;
        const description = jobText ?? posting?.description ?? "";
        if (!description.trim()) {
            throw new BadRequestException("No job description to tailor against — paste one or pick a posting.");
        }

        const wanted = extractRequirements(description);

        // ─── stage 1: deterministic tag overlap ───
        const projectDecisions = rankProjects(profile.projectItems, wanted);
        const experienceDecisions = rankExperience(profile.experienceItems, wanted);
        const decisions = [...projectDecisions, ...experienceDecisions];

        const included = new Set(decisions.filter((d) => d.included).map((d) => d.itemId));

        // ─── stage 2: model refinement (optional) ───
        let summary: string[] = splitLines(profile.summary);
        let rewrittenPoints: Record<string, string[]> = {};
        let model: string | null = null;

        if (this.llm.isConfigured()) {
            try {
                const refined = await this.refine({
                    profile,
                    description,
                    includedProjects: profile.projectItems.filter((p) => included.has(p.id)),
                    includedExperience: profile.experienceItems.filter((e) => included.has(e.id)),
                });
                summary = refined.summary.length ? refined.summary : summary;
                rewrittenPoints = refined.points;
                model = refined.model;
            } catch (err) {
                // Degrade to the deterministic result rather than failing the whole
                // Execute — the ranking alone still produces a usable resume.
                this.logger.warn(`Tailoring refinement unavailable: ${(err as Error).message}`);
            }
        }

        // ─── the fabrication guard ───
        const known = knownVocabulary(profile);
        const { cleanedPoints, unsupportedClaims, rejectedTechnologies } = this.guard(
            rewrittenPoints,
            profile.experienceItems,
            known
        );

        return {
            decisions,
            summary,
            rewrittenPoints: cleanedPoints,
            unsupportedClaims,
            rejectedTechnologies,
            model,
        };
    }

    private async refine(params: {
        profile: { name: string; headline: string | null; summary: string | null };
        description: string;
        includedProjects: ProfileProject[];
        includedExperience: ProfileExperience[];
    }) {
        const payload = {
            candidate: {
                name: params.profile.name,
                headline: params.profile.headline,
                summary: params.profile.summary,
            },
            experience: params.includedExperience.map((e) => ({
                id: e.id,
                company: e.company,
                position: e.position,
                period: e.period,
                employmentType: e.employmentType,
                points: (e.points as string[] | null) ?? [],
                stack: (e.stack as string[] | null) ?? [],
            })),
            projects: params.includedProjects.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                stack: (p.stack as string[] | null) ?? [],
            })),
        };

        const { value, result } = await this.llm.completeJson<{
            summary?: string[];
            points?: Record<string, string[]>;
        }>(
            [
                { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        "# Job description",
                        clampText(params.description, 8000) ?? "",
                        "",
                        "# Candidate material (the ONLY facts you may use)",
                        JSON.stringify(payload),
                    ].join("\n"),
                },
            ],
            { temperature: 0.2, maxTokens: 3000, json: true }
        );

        return {
            summary: Array.isArray(value?.summary) ? value!.summary.filter((s) => typeof s === "string") : [],
            points: (value?.points ?? {}) as Record<string, string[]>,
            model: result.model,
        };
    }

    /**
     * Reject anything the profile does not evidence.
     *
     * A rewritten bullet may only recombine words the candidate's own material
     * already contains. A technology named in output but absent from the profile
     * is dropped outright — that is the failure that puts someone in an
     * interview defending experience they do not have.
     */
    private guard(
        rewritten: Record<string, string[]>,
        experience: ProfileExperience[],
        known: { tech: Set<string>; corpus: string }
    ) {
        const cleanedPoints: Record<string, string[]> = {};
        const unsupportedClaims: string[] = [];
        const rejectedTechnologies: string[] = [];

        const original = new Map(experience.map((e) => [e.id, ((e.points as string[] | null) ?? []).join(" ")]));

        for (const [itemId, points] of Object.entries(rewritten)) {
            if (!Array.isArray(points)) continue;
            const kept: string[] = [];

            for (const point of points) {
                if (typeof point !== "string" || !point.trim()) continue;

                // Any capitalised or dotted token that looks like a technology and
                // is not in the profile's vocabulary is disqualifying.
                const invented = candidateTechTokens(point).filter((t) => !known.tech.has(t.toLowerCase()));
                if (invented.length) {
                    rejectedTechnologies.push(...invented);
                    unsupportedClaims.push(point);
                    continue;
                }

                // Numbers are the other common fabrication: "improved performance"
                // becomes "improved performance by 40%". Only keep figures that
                // already appear in this item's own source text.
                const source = original.get(itemId) ?? "";
                const newNumbers = (point.match(/\b\d[\d,.]*%?\b/g) ?? []).filter((n) => !source.includes(n) && !known.corpus.includes(n));
                if (newNumbers.length) {
                    unsupportedClaims.push(point);
                    continue;
                }

                kept.push(point.trim());
            }

            if (kept.length) cleanedPoints[itemId] = kept;
        }

        return {
            cleanedPoints,
            unsupportedClaims,
            rejectedTechnologies: [...new Set(rejectedTechnologies)],
        };
    }
}

/* ─── deterministic ranking ──────────────────────────────────── */

/** Requirement tokens lifted from the job text — no model needed. */
export function extractRequirements(description: string): Set<string> {
    const text = description.toLowerCase();
    const tokens = text.match(/[a-z][a-z0-9+#.]{1,24}/g) ?? [];
    const stop = new Set([
        "and","the","for","with","you","your","our","are","will","have","has","this","that","from","who","all","any",
        "work","team","role","job","years","year","experience","strong","good","plus","must","should","using","use",
        "build","building","develop","development","developer","engineer","software","technologies","technology",
    ]);
    return new Set(tokens.filter((t) => t.length > 1 && !stop.has(t)));
}

function rankProjects(projects: ProfileProject[], wanted: Set<string>): TailoringDecision[] {
    const scored = projects.map((project) => {
        const stack = ((project.stack as string[] | null) ?? []).map((s) => s.trim()).filter(Boolean);
        const matched = stack.filter((tag) => tagMatches(tag, wanted));
        return { project, stack, matched, score: matched.length };
    });

    const ordered = [...scored].sort((a, b) => b.score - a.score);
    // If nothing matches at all, keep the top few rather than emitting an empty
    // resume — a weak match still beats a blank Projects section.
    const anyMatch = ordered.some((s) => s.score >= MIN_OVERLAP);
    const keep = new Set(
        ordered
            .filter((s) => (anyMatch ? s.score >= MIN_OVERLAP : true))
            .slice(0, MAX_PROJECTS)
            .map((s) => s.project.id)
    );

    return ordered.map((s) => ({
        itemId: s.project.id,
        itemType: "project" as const,
        included: keep.has(s.project.id),
        overlapScore: s.score,
        matchedTags: s.matched,
        reason: keep.has(s.project.id)
            ? s.score >= MIN_OVERLAP
                ? `Matches ${s.matched.join(", ")}`
                : "Kept to fill the section — no project matched this job's stack"
            : s.score >= MIN_OVERLAP
              ? "Weaker match than the projects above it"
              : `Nothing in ${s.stack.join(", ") || "its stack"} matches this job`,
    }));
}

function rankExperience(experience: ProfileExperience[], wanted: Set<string>): TailoringDecision[] {
    // Employment history is never dropped — a gap in dates reads far worse than
    // a role that matches poorly. It is only reweighted.
    return experience.map((role) => {
        const stack = ((role.stack as string[] | null) ?? []).map((s) => s.trim()).filter(Boolean);
        const matched = stack.filter((tag) => tagMatches(tag, wanted));
        return {
            itemId: role.id,
            itemType: "experience" as const,
            included: true,
            overlapScore: matched.length,
            matchedTags: matched,
            reason: matched.length
                ? `Matches ${matched.join(", ")}`
                : "Kept — employment history stays complete even when the stack differs",
        };
    });
}

/** A tag matches if the job asks for it, allowing for "Next.js" vs "nextjs". */
function tagMatches(tag: string, wanted: Set<string>): boolean {
    const lower = tag.toLowerCase();
    if (wanted.has(lower)) return true;
    const squashed = lower.replace(/[.\s-]/g, "");
    for (const w of wanted) {
        if (w.replace(/[.\s-]/g, "") === squashed) return true;
    }
    return false;
}

/* ─── vocabulary ─────────────────────────────────────────────── */

function knownVocabulary(profile: {
    projectItems: ProfileProject[];
    experienceItems: ProfileExperience[];
    skillItems: Array<{ name: string }>;
    summary: string | null;
    headline: string | null;
    bio?: string | null;
}) {
    const tech = new Set<string>();
    const parts: string[] = [];

    for (const s of profile.skillItems) tech.add(s.name.toLowerCase());
    for (const p of profile.projectItems) {
        for (const t of (p.stack as string[] | null) ?? []) tech.add(t.toLowerCase());
        parts.push(p.name, p.description ?? "");
    }
    for (const e of profile.experienceItems) {
        for (const t of (e.stack as string[] | null) ?? []) tech.add(t.toLowerCase());
        parts.push(e.company, e.position, ...(((e.points as string[] | null) ?? []) as string[]));
    }
    parts.push(profile.summary ?? "", profile.headline ?? "", profile.bio ?? "");

    const corpus = parts.join(" ");
    // Words already used in the candidate's own prose count as known, so a
    // rewrite that reuses their vocabulary is not flagged.
    for (const token of corpus.match(/[A-Za-z][A-Za-z0-9+#.]{1,24}/g) ?? []) tech.add(token.toLowerCase());

    return { tech, corpus };
}

/**
 * Tokens that look like a technology claim.
 *
 * The naive rule — "skip anything matching /^[A-Z][a-z]+$/ because it is
 * probably an ordinary word" — is exactly the shape of Kubernetes, Laravel,
 * Django and Redis, so it let every invented technology through. Position is
 * what actually distinguishes them: a capitalised word at the start of a
 * sentence is usually prose, while one mid-sentence is usually a proper noun.
 * Anything dotted or containing digits/+/# is treated as a technology wherever
 * it appears.
 */
function candidateTechTokens(text: string): string[] {
    const found: string[] = [];

    // Split on sentence boundaries so "first word" means what it should.
    for (const sentence of text.split(/(?<=[.!?;:])\s+|\n+/)) {
        const words = sentence.trim().split(/\s+/).filter(Boolean);

        words.forEach((raw, index) => {
            const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#.]+$/g, "");
            if (token.length < 2) return;

            // Dotted or symbol-bearing names are technologies wherever they sit:
            // Next.js, Node.js, C++, C#, ES6.
            const isSymbolic = /[.+#]/.test(token) || /[A-Za-z][0-9]/.test(token);

            // Internal capitals give away NestJS, PostgreSQL, GraphQL.
            const hasInnerCaps = /^[A-Z][a-z]*[A-Z]/.test(token);

            // A plain capitalised word only counts mid-sentence — leading ones
            // are ordinary prose ("Scaled clusters across regions").
            const isMidSentenceProperNoun = index > 0 && /^[A-Z][a-z]+$/.test(token);

            if (isSymbolic || hasInnerCaps || isMidSentenceProperNoun) found.push(token);
        });
    }

    return found;
}

function splitLines(value: string | null): string[] {
    if (!value?.trim()) return [];
    return value
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
}
