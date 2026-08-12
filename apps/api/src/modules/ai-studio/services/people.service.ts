import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { ProfileCompositionService } from "@/modules/ai-studio/services/profile-composition.service";
import type {
    BulkSkillsDto,
    CreatePersonDto,
    ListPeopleQueryDto,
    ReorderDto,
    UpdatePersonDto,
    UpsertEducationDto,
    UpsertExperienceDto,
    UpsertLinkDto,
    UpsertProjectDto,
    UpsertSkillDto,
} from "@/modules/ai-studio/dto/people.dto";

/**
 * People — the candidate records the Studio builds resumes from.
 *
 * This deliberately operates on the same `CandidateProfile` Job Finder scores
 * against rather than a parallel entity: a second person record would give two
 * truths about the same human and let matching drift from generation.
 *
 * Every mutation of a child collection ends with a
 * {@link ProfileCompositionService.syncDerivedJson} call — the JSON columns are
 * a derived cache, and skipping the sync means Job Finder silently scores
 * against stale data rather than failing loudly.
 */
@Injectable()
export class PeopleService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly composition: ProfileCompositionService
    ) {}

    /* ─── profile ────────────────────────────────────────────── */

    async list(query: ListPeopleQueryDto) {
        const where: Prisma.CandidateProfileWhereInput = query.search
            ? {
                  OR: [
                      // Postgres compares case-sensitively; MySQL did not.
                      { name: { contains: query.search, mode: "insensitive" } },
                      { headline: { contains: query.search, mode: "insensitive" } },
                      { email: { contains: query.search, mode: "insensitive" } },
                  ],
              }
            : {};

        const [rows, total] = await Promise.all([
            this.prisma.candidateProfile.findMany({
                where,
                orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
                take: query.limit ?? 50,
                skip: query.offset ?? 0,
                select: {
                    id: true,
                    name: true,
                    headline: true,
                    email: true,
                    phone: true,
                    location: true,
                    isDefault: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            projectItems: true,
                            experienceItems: true,
                            skillItems: true,
                            infoItems: true,
                            documents: true,
                            applications: true,
                        },
                    },
                },
            }),
            this.prisma.candidateProfile.count({ where }),
        ]);

        return { data: rows, total };
    }

    /** Full profile with every relational collection, ordered for the editor. */
    async getOne(id: string) {
        const profile = await this.prisma.candidateProfile.findUnique({
            where: { id },
            include: {
                projectItems: { orderBy: { sortOrder: "asc" } },
                experienceItems: { orderBy: { sortOrder: "asc" } },
                educationItems: { orderBy: { sortOrder: "asc" } },
                skillItems: { orderBy: { sortOrder: "asc" } },
                linkItems: { orderBy: { sortOrder: "asc" } },
                _count: { select: { infoItems: true, documents: true, applications: true } },
            },
        });
        if (!profile) throw new NotFoundException("Person not found");

        const pendingFacts = await this.prisma.profileFactProposal.count({
            where: { profileId: id, status: "pending" },
        });

        return { ...profile, pendingFacts };
    }

    async create(dto: CreatePersonDto) {
        const profile = await this.prisma.candidateProfile.create({
            data: {
                name: dto.name.trim(),
                headline: dto.headline ?? null,
                email: dto.email ?? null,
                phone: dto.phone ?? null,
                location: dto.location ?? null,
                timezone: dto.timezone ?? null,
                availability: dto.availability ?? null,
                summary: dto.summary ?? null,
                bio: dto.bio ?? null,
                titles: (dto.titles ?? []) as Prisma.InputJsonValue,
                preferredTitles: (dto.preferredTitles ?? []) as Prisma.InputJsonValue,
                certifications: (dto.certifications ?? []) as Prisma.InputJsonValue,
                languages: (dto.languages ?? []) as Prisma.InputJsonValue,
                // Derived caches start empty and are filled by syncDerivedJson as
                // relational rows are added.
                skills: [] as Prisma.InputJsonValue,
                experience: [] as Prisma.InputJsonValue,
                education: [] as Prisma.InputJsonValue,
                projects: [] as Prisma.InputJsonValue,
                links: [] as Prisma.InputJsonValue,
                sourceType: "manual",
            },
        });
        return profile;
    }

    async update(id: string, dto: UpdatePersonDto) {
        await this.assertExists(id);
        return this.prisma.candidateProfile.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name.trim() }),
                ...(dto.headline !== undefined && { headline: dto.headline }),
                ...(dto.email !== undefined && { email: dto.email }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.location !== undefined && { location: dto.location }),
                ...(dto.timezone !== undefined && { timezone: dto.timezone }),
                ...(dto.availability !== undefined && { availability: dto.availability }),
                ...(dto.summary !== undefined && { summary: dto.summary }),
                ...(dto.bio !== undefined && { bio: dto.bio }),
                ...(dto.titles !== undefined && { titles: dto.titles as Prisma.InputJsonValue }),
                ...(dto.preferredTitles !== undefined && {
                    preferredTitles: dto.preferredTitles as Prisma.InputJsonValue,
                }),
                ...(dto.certifications !== undefined && {
                    certifications: dto.certifications as Prisma.InputJsonValue,
                }),
                ...(dto.languages !== undefined && { languages: dto.languages as Prisma.InputJsonValue }),
            },
        });
    }

    async setDefault(id: string) {
        await this.assertExists(id);
        await this.prisma.$transaction([
            this.prisma.candidateProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
            this.prisma.candidateProfile.update({ where: { id }, data: { isDefault: true } }),
        ]);
        return this.prisma.candidateProfile.findUnique({ where: { id } });
    }

    /**
     * Deleting a person cascades to their projects, experience, attachments,
     * generated documents and Studio conversations. Applications are counted
     * first and reported, because losing application history silently would be
     * worse than refusing.
     */
    async remove(id: string) {
        await this.assertExists(id);
        const counts = await this.prisma.candidateProfile.findUnique({
            where: { id },
            select: { _count: { select: { applications: true, documents: true } } },
        });
        await this.prisma.candidateProfile.delete({ where: { id } });
        return {
            id,
            removedApplications: counts?._count.applications ?? 0,
            removedDocuments: counts?._count.documents ?? 0,
        };
    }

    /** Explode an imported profile's JSON into editable rows. */
    async backfillFromJson(id: string) {
        await this.assertExists(id);
        const counts = await this.composition.explodeFromJson(id);
        await this.composition.syncDerivedJson(id);
        return counts;
    }

    /* ─── projects ───────────────────────────────────────────── */

    async addProject(profileId: string, dto: UpsertProjectDto) {
        await this.assertExists(profileId);
        this.assertStack(dto.stack);
        const row = await this.prisma.profileProject.create({
            data: {
                profileId,
                name: dto.name.trim(),
                description: dto.description ?? null,
                role: dto.role ?? null,
                period: dto.period ?? null,
                stack: normalizeTags(dto.stack) as Prisma.InputJsonValue,
                metrics: (dto.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
                note: dto.note ?? null,
                url: dto.url ?? null,
                sortOrder: dto.sortOrder ?? (await this.nextOrder("profileProject", profileId)),
                isActive: dto.isActive ?? true,
            },
        });
        await this.composition.syncDerivedJson(profileId);
        return row;
    }

    async updateProject(id: string, dto: Partial<UpsertProjectDto>) {
        const existing = await this.prisma.profileProject.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Project not found");
        if (dto.stack !== undefined) this.assertStack(dto.stack);

        const row = await this.prisma.profileProject.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name.trim() }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.role !== undefined && { role: dto.role }),
                ...(dto.period !== undefined && { period: dto.period }),
                ...(dto.stack !== undefined && { stack: normalizeTags(dto.stack) as Prisma.InputJsonValue }),
                ...(dto.metrics !== undefined && { metrics: dto.metrics as Prisma.InputJsonValue }),
                ...(dto.note !== undefined && { note: dto.note }),
                ...(dto.url !== undefined && { url: dto.url }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
        await this.composition.syncDerivedJson(existing.profileId);
        return row;
    }

    async removeProject(id: string) {
        const existing = await this.prisma.profileProject.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Project not found");
        await this.prisma.profileProject.delete({ where: { id } });
        await this.composition.syncDerivedJson(existing.profileId);
        return { id };
    }

    /* ─── experience ─────────────────────────────────────────── */

    async addExperience(profileId: string, dto: UpsertExperienceDto) {
        await this.assertExists(profileId);
        const row = await this.prisma.profileExperience.create({
            data: {
                profileId,
                company: dto.company.trim(),
                position: dto.position.trim(),
                period: dto.period.trim(),
                location: dto.location ?? null,
                employmentType: dto.employmentType ?? null,
                points: (dto.points ?? []) as Prisma.InputJsonValue,
                stack: normalizeTags(dto.stack ?? []) as Prisma.InputJsonValue,
                sortOrder: dto.sortOrder ?? (await this.nextOrder("profileExperience", profileId)),
                isActive: dto.isActive ?? true,
            },
        });
        await this.composition.syncDerivedJson(profileId);
        return row;
    }

    async updateExperience(id: string, dto: Partial<UpsertExperienceDto>) {
        const existing = await this.prisma.profileExperience.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Experience not found");
        const row = await this.prisma.profileExperience.update({
            where: { id },
            data: {
                ...(dto.company !== undefined && { company: dto.company.trim() }),
                ...(dto.position !== undefined && { position: dto.position.trim() }),
                ...(dto.period !== undefined && { period: dto.period.trim() }),
                ...(dto.location !== undefined && { location: dto.location }),
                ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
                ...(dto.points !== undefined && { points: dto.points as Prisma.InputJsonValue }),
                ...(dto.stack !== undefined && { stack: normalizeTags(dto.stack) as Prisma.InputJsonValue }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
        await this.composition.syncDerivedJson(existing.profileId);
        return row;
    }

    async removeExperience(id: string) {
        const existing = await this.prisma.profileExperience.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Experience not found");
        await this.prisma.profileExperience.delete({ where: { id } });
        await this.composition.syncDerivedJson(existing.profileId);
        return { id };
    }

    /* ─── education ──────────────────────────────────────────── */

    async addEducation(profileId: string, dto: UpsertEducationDto) {
        await this.assertExists(profileId);
        const row = await this.prisma.profileEducation.create({
            data: {
                profileId,
                institution: dto.institution.trim(),
                degree: dto.degree.trim(),
                period: dto.period.trim(),
                location: dto.location ?? null,
                note: dto.note ?? null,
                sortOrder: dto.sortOrder ?? (await this.nextOrder("profileEducation", profileId)),
                isActive: dto.isActive ?? true,
            },
        });
        await this.composition.syncDerivedJson(profileId);
        return row;
    }

    async updateEducation(id: string, dto: Partial<UpsertEducationDto>) {
        const existing = await this.prisma.profileEducation.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Education entry not found");
        const row = await this.prisma.profileEducation.update({
            where: { id },
            data: {
                ...(dto.institution !== undefined && { institution: dto.institution.trim() }),
                ...(dto.degree !== undefined && { degree: dto.degree.trim() }),
                ...(dto.period !== undefined && { period: dto.period.trim() }),
                ...(dto.location !== undefined && { location: dto.location }),
                ...(dto.note !== undefined && { note: dto.note }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
        await this.composition.syncDerivedJson(existing.profileId);
        return row;
    }

    async removeEducation(id: string) {
        const existing = await this.prisma.profileEducation.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Education entry not found");
        await this.prisma.profileEducation.delete({ where: { id } });
        await this.composition.syncDerivedJson(existing.profileId);
        return { id };
    }

    /* ─── skills ─────────────────────────────────────────────── */

    async addSkills(profileId: string, dto: BulkSkillsDto) {
        await this.assertExists(profileId);
        const base = await this.nextOrder("profileSkill", profileId);
        // skipDuplicates leans on @@unique([profileId, name]) so re-submitting a
        // list that overlaps existing skills is a no-op rather than an error.
        const res = await this.prisma.profileSkill.createMany({
            data: dto.skills.map((s, i) => ({
                profileId,
                name: s.name.trim(),
                category: s.category ?? null,
                level: s.level ?? null,
                highlighted: s.highlighted ?? false,
                sortOrder: s.sortOrder ?? base + i,
            })),
            skipDuplicates: true,
        });
        await this.composition.syncDerivedJson(profileId);
        return { added: res.count, submitted: dto.skills.length };
    }

    async updateSkill(id: string, dto: Partial<UpsertSkillDto>) {
        const existing = await this.prisma.profileSkill.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Skill not found");
        const row = await this.prisma.profileSkill.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name.trim() }),
                ...(dto.category !== undefined && { category: dto.category }),
                ...(dto.level !== undefined && { level: dto.level }),
                ...(dto.highlighted !== undefined && { highlighted: dto.highlighted }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
            },
        });
        await this.composition.syncDerivedJson(existing.profileId);
        return row;
    }

    async removeSkill(id: string) {
        const existing = await this.prisma.profileSkill.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Skill not found");
        await this.prisma.profileSkill.delete({ where: { id } });
        await this.composition.syncDerivedJson(existing.profileId);
        return { id };
    }

    /* ─── links ──────────────────────────────────────────────── */

    async addLink(profileId: string, dto: UpsertLinkDto) {
        await this.assertExists(profileId);
        const row = await this.prisma.profileLink.create({
            data: {
                profileId,
                label: dto.label.trim(),
                url: dto.url.trim(),
                kind: dto.kind ?? inferLinkKind(dto.url),
                sortOrder: dto.sortOrder ?? (await this.nextOrder("profileLink", profileId)),
            },
        });
        await this.composition.syncDerivedJson(profileId);
        return row;
    }

    async updateLink(id: string, dto: Partial<UpsertLinkDto>) {
        const existing = await this.prisma.profileLink.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Link not found");
        const row = await this.prisma.profileLink.update({
            where: { id },
            data: {
                ...(dto.label !== undefined && { label: dto.label.trim() }),
                ...(dto.url !== undefined && { url: dto.url.trim(), kind: dto.kind ?? inferLinkKind(dto.url) }),
                ...(dto.kind !== undefined && { kind: dto.kind }),
                ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
            },
        });
        await this.composition.syncDerivedJson(existing.profileId);
        return row;
    }

    async removeLink(id: string) {
        const existing = await this.prisma.profileLink.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException("Link not found");
        await this.prisma.profileLink.delete({ where: { id } });
        await this.composition.syncDerivedJson(existing.profileId);
        return { id };
    }

    /* ─── ordering ───────────────────────────────────────────── */

    /** Reorder a collection by id order. Resume section order is meaningful. */
    async reorder(
        profileId: string,
        collection: "projects" | "experience" | "education" | "skills" | "links",
        dto: ReorderDto
    ) {
        await this.assertExists(profileId);
        const delegate = {
            projects: this.prisma.profileProject,
            experience: this.prisma.profileExperience,
            education: this.prisma.profileEducation,
            skills: this.prisma.profileSkill,
            links: this.prisma.profileLink,
        }[collection];

        await this.prisma.$transaction(
            dto.ids.map((id, index) =>
                // @ts-expect-error — delegates share this shape but not a common type
                delegate.updateMany({ where: { id, profileId }, data: { sortOrder: index } })
            )
        );
        await this.composition.syncDerivedJson(profileId);
        return { reordered: dto.ids.length };
    }

    /* ─── helpers ────────────────────────────────────────────── */

    private async assertExists(id: string) {
        const found = await this.prisma.candidateProfile.findUnique({ where: { id }, select: { id: true } });
        if (!found) throw new NotFoundException("Person not found");
    }

    private assertStack(stack: string[]) {
        if (!normalizeTags(stack).length) {
            throw new BadRequestException(
                "At least one technology tag is required — tags are how a project gets matched to a job."
            );
        }
    }

    private async nextOrder(
        model: "profileProject" | "profileExperience" | "profileEducation" | "profileSkill" | "profileLink",
        profileId: string
    ): Promise<number> {
        // @ts-expect-error — delegates share this shape but not a common type
        const last = await this.prisma[model].findFirst({
            where: { profileId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });
        return (last?.sortOrder ?? -1) + 1;
    }
}

/** Trim, drop blanks, and de-duplicate case-insensitively while keeping the
 *  first spelling — "React" and "react" are one tag, written as typed. */
function normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
        const tag = typeof raw === "string" ? raw.trim() : "";
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
    }
    return out;
}

function inferLinkKind(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("github.com")) return "github";
    return "portfolio";
}
