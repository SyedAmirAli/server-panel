import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { UrlImportSource } from "@/modules/job-finder/sources/url-import.source";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { CandidateProfileService } from "@/modules/job-finder/services/candidate-profile.service";
import { JobMatchingService } from "@/modules/job-finder/services/job-matching.service";
import { dedupeHash } from "@/modules/job-finder/sources/source.utils";
import { ListPostingsQueryDto } from "@/modules/job-finder/dto/list-postings.dto";

/** Read/curate the discovered postings, plus one-off URL imports. */
@Injectable()
export class JobPostingsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly urlImport: UrlImportSource,
        private readonly settings: JobFinderSettingsService,
        private readonly profiles: CandidateProfileService,
        private readonly matching: JobMatchingService
    ) {}

    /**
     * The found-jobs list: newest first, with the star rating joined in.
     *
     * Ordered by `postedAt` descending with `discoveredAt` as the tiebreaker, so
     * postings whose board omitted a publish time still land sensibly.
     */
    async list(query: ListPostingsQueryDto) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 25));

        const where: Prisma.JobPostingWhereInput = {
            ...(query.status ? { status: query.status } : { status: { notIn: ["archived", "dismissed"] } }),
            ...(query.sourceId ? { sourceId: query.sourceId } : {}),
            ...(query.isRemote !== undefined ? { isRemote: query.isRemote } : {}),
            ...(query.since ? { postedAt: { gte: new Date(query.since) } } : {}),
            ...(query.search
                ? {
                      OR: [
                          { title: { contains: query.search } },
                          { company: { contains: query.search } },
                          { location: { contains: query.search } },
                      ],
                  }
                : {}),
            // Star filtering lives on the joined match row.
            ...(query.minStars ? { matches: { some: { stars: { gte: query.minStars } } } } : {}),
        };

        const [total, rows] = await this.prisma.$transaction([
            this.prisma.jobPosting.count({ where }),
            this.prisma.jobPosting.findMany({
                where,
                orderBy: [{ postedAt: "desc" }, { discoveredAt: "desc" }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    source: { select: { key: true, name: true } },
                    matches: { orderBy: { scoredAt: "desc" }, take: 1 },
                },
            }),
        ]);

        return {
            data: rows.map((row) => this.toView(row)),
            total,
            currentPage: page,
            perPage: limit,
            lastPage: Math.max(1, Math.ceil(total / limit)),
            hasMore: page * limit < total,
        };
    }

    async getOne(id: string) {
        const posting = await this.prisma.jobPosting.findUnique({
            where: { id },
            include: {
                source: { select: { key: true, name: true } },
                matches: { orderBy: { scoredAt: "desc" } },
                applications: { orderBy: { createdAt: "desc" } },
            },
        });
        if (!posting) throw new NotFoundException("Job posting not found");
        return { ...this.toView(posting), applications: posting.applications };
    }

    /** Shortlist / dismiss / archive — user curation of the list. */
    async setStatus(id: string, status: string) {
        await this.assertExists(id);
        return this.prisma.jobPosting.update({ where: { id }, data: { status } });
    }

    /** Re-score one posting (e.g. after the profile was re-imported). */
    async rescore(id: string) {
        const posting = await this.prisma.jobPosting.findUnique({ where: { id } });
        if (!posting) throw new NotFoundException("Job posting not found");

        const profile = await this.profiles.getActive();
        if (!profile) throw new NotFoundException("No candidate profile — import your resume first");

        const settings = await this.settings.get();
        return this.matching.scoreOne(posting, profile, undefined, settings.scoringModel);
    }

    /**
     * Import a single posting from a URL and score it immediately, so the user
     * gets a rating in one action.
     */
    async importFromUrl(url: string) {
        const settings = await this.settings.get();
        const posting = await this.urlImport.importUrl(url, settings.extractionModel);
        const hash = dedupeHash(posting);

        const source = await this.prisma.jobSource.findUnique({ where: { key: "url-import" } });

        const saved = await this.prisma.jobPosting.upsert({
            where: { dedupeHash: hash },
            update: {
                // Refresh the content, but never overturn the user's own curation.
                title: posting.title.slice(0, 255),
                company: posting.company.slice(0, 191),
                description: posting.description ?? null,
                applyEmail: posting.applyEmail?.slice(0, 191) ?? null,
            },
            create: {
                sourceId: source?.id ?? null,
                dedupeHash: hash,
                title: posting.title.slice(0, 255),
                company: posting.company.slice(0, 191),
                location: posting.location?.slice(0, 191) ?? null,
                isRemote: posting.isRemote,
                employmentType: posting.employmentType?.slice(0, 64) ?? null,
                salaryRaw: posting.salaryRaw?.slice(0, 191) ?? null,
                url: posting.url,
                applyUrl: posting.applyUrl ?? null,
                applyEmail: posting.applyEmail?.slice(0, 191) ?? null,
                description: posting.description ?? null,
                tags: posting.tags ?? [],
                postedAt: posting.postedAt ?? new Date(),
                raw: posting.raw ? (JSON.parse(JSON.stringify(posting.raw)) as object) : undefined,
            },
        });

        const profile = await this.profiles.getActive();
        if (profile) {
            await this.matching.scoreOne(saved, profile, undefined, settings.scoringModel);
        }

        return this.getOne(saved.id);
    }

    async remove(id: string) {
        await this.assertExists(id);
        return this.prisma.jobPosting.delete({ where: { id } });
    }

    private async assertExists(id: string) {
        const found = await this.prisma.jobPosting.findUnique({ where: { id }, select: { id: true } });
        if (!found) throw new NotFoundException("Job posting not found");
        return found;
    }

    /** Flatten the single most recent match onto the row for the list UI. */
    private toView<T extends { matches?: unknown[]; source?: { key: string; name: string } | null }>(row: T) {
        const { matches, source, ...rest } = row as T & Record<string, unknown>;
        return {
            ...rest,
            sourceKey: source?.key ?? null,
            sourceName: source?.name ?? null,
            match: Array.isArray(matches) && matches.length ? matches[0] : null,
        };
    }
}
