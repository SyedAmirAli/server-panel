import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * Keeps `CandidateProfile`'s JSON columns in sync with the relational rows.
 *
 * The relational rows are the source of truth — they are what People edits and
 * what a generated resume selects from. The JSON columns stay as a **derived
 * cache** purely so Job Finder's scoring and `renderProfileForMatching` keep
 * working exactly as before, without touching a line of that module.
 *
 * Every write path in People must call {@link syncDerivedJson} afterwards, or
 * matching silently scores against stale data.
 */
@Injectable()
export class ProfileCompositionService {
    private readonly logger = new Logger(ProfileCompositionService.name);

    constructor(private readonly prisma: PrismaService) {}

    /** Recompose the JSON columns for one profile from its relational rows. */
    async syncDerivedJson(profileId: string) {
        const [projects, experiences, skills, links, educations] = await Promise.all([
            this.prisma.profileProject.findMany({
                where: { profileId, isActive: true },
                orderBy: { sortOrder: "asc" },
            }),
            this.prisma.profileExperience.findMany({
                where: { profileId, isActive: true },
                orderBy: { sortOrder: "asc" },
            }),
            this.prisma.profileSkill.findMany({ where: { profileId }, orderBy: { sortOrder: "asc" } }),
            this.prisma.profileLink.findMany({ where: { profileId }, orderBy: { sortOrder: "asc" } }),
            this.prisma.profileEducation.findMany({
                where: { profileId, isActive: true },
                orderBy: { sortOrder: "asc" },
            }),
        ]);

        // Shapes below must match what job-finder's prompts already expect —
        // see renderProfileForMatching. Changing a key here silently degrades
        // scoring rather than throwing, so keep them aligned.
        const data: Prisma.CandidateProfileUpdateInput = {
            projects: projects.map((p) => ({
                name: p.name,
                description: p.description ?? "",
                stack: asStringArray(p.stack),
                ...(p.note ? { note: p.note } : {}),
                ...(p.metrics ? { metrics: p.metrics } : {}),
            })) as Prisma.InputJsonValue,

            experience: experiences.map((e) => ({
                company: e.company,
                position: e.position,
                period: e.period,
                ...(e.location ? { location: e.location } : {}),
                ...(e.employmentType ? { employmentType: e.employmentType } : {}),
                points: asStringArray(e.points),
                ...(e.stack ? { stack: asStringArray(e.stack) } : {}),
            })) as Prisma.InputJsonValue,

            skills: skills.map((s) => ({
                name: s.name,
                ...(s.category ? { category: s.category } : {}),
                ...(s.highlighted ? { highlighted: true } : {}),
            })) as Prisma.InputJsonValue,

            education: educations.map((e) => ({
                institution: e.institution,
                degree: e.degree,
                period: e.period,
                ...(e.location ? { location: e.location } : {}),
            })) as Prisma.InputJsonValue,

            links: links.map((l) => ({ label: l.label, url: l.url })) as Prisma.InputJsonValue,
        };

        await this.prisma.candidateProfile.update({ where: { id: profileId }, data });
        return { projects: projects.length, experiences: experiences.length, skills: skills.length };
    }

    /**
     * One-off backfill: explode a profile's existing JSON columns into relational
     * rows. Used when a profile was imported from the resume repo before the
     * relational tables existed.
     *
     * Skips any collection that already has rows, so re-running cannot duplicate
     * hand-edited data.
     */
    async explodeFromJson(profileId: string) {
        const profile = await this.prisma.candidateProfile.findUnique({ where: { id: profileId } });
        if (!profile) return null;

        const counts = { projects: 0, experiences: 0, skills: 0, education: 0, links: 0 };

        const existing = await Promise.all([
            this.prisma.profileProject.count({ where: { profileId } }),
            this.prisma.profileExperience.count({ where: { profileId } }),
            this.prisma.profileSkill.count({ where: { profileId } }),
            this.prisma.profileEducation.count({ where: { profileId } }),
            this.prisma.profileLink.count({ where: { profileId } }),
        ]);

        if (existing[0] === 0) {
            const rows = asArray(profile.projects).map((p, i) => ({
                profileId,
                name: str(p.name),
                description: str(p.description) || null,
                stack: asStringArray(p.stack) as Prisma.InputJsonValue,
                metrics: (p.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
                note: str(p.note) || null,
                sortOrder: i,
            }));
            if (rows.length) counts.projects = (await this.prisma.profileProject.createMany({ data: rows })).count;
        }

        if (existing[1] === 0) {
            const rows = asArray(profile.experience).map((e, i) => ({
                profileId,
                company: str(e.company),
                position: str(e.position),
                period: str(e.period),
                location: str(e.location) || null,
                employmentType: str(e.employmentType) || null,
                points: asStringArray(e.points) as Prisma.InputJsonValue,
                stack: asStringArray(e.stack) as Prisma.InputJsonValue,
                sortOrder: i,
            }));
            if (rows.length)
                counts.experiences = (await this.prisma.profileExperience.createMany({ data: rows })).count;
        }

        if (existing[2] === 0) {
            // The @@unique([profileId, name]) makes skipDuplicates the safety net
            // for CVs that list the same skill under two categories.
            const rows = asArray(profile.skills).map((s, i) => ({
                profileId,
                name: str(s.name),
                category: str(s.category) || null,
                highlighted: Boolean(s.highlighted),
                sortOrder: i,
            }));
            if (rows.length)
                counts.skills = (
                    await this.prisma.profileSkill.createMany({ data: rows, skipDuplicates: true })
                ).count;
        }

        if (existing[3] === 0) {
            const rows = asArray(profile.education).map((e, i) => ({
                profileId,
                institution: str(e.institution),
                degree: str(e.degree),
                period: str(e.period),
                location: str(e.location) || null,
                sortOrder: i,
            }));
            if (rows.length)
                counts.education = (await this.prisma.profileEducation.createMany({ data: rows })).count;
        }

        if (existing[4] === 0) {
            const rows = asArray(profile.links).map((l, i) => ({
                profileId,
                label: str(l.label),
                url: str(l.url),
                kind: linkKind(str(l.url)),
                sortOrder: i,
            }));
            if (rows.length) counts.links = (await this.prisma.profileLink.createMany({ data: rows })).count;
        }

        this.logger.log(`Backfilled profile ${profileId}: ${JSON.stringify(counts)}`);
        return counts;
    }
}

/* ─── helpers ────────────────────────────────────────────────── */

/** Json columns come back as `unknown`; treat anything unexpected as empty. */
function asArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Array<Record<string, unknown>>) : [];
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/** Classify a link so the ATS header can pick what to print without regexing URLs. */
function linkKind(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("github.com")) return "github";
    if (u) return "portfolio";
    return "other";
}
