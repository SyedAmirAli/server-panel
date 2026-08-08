import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, fetchJson, stripHtml, toDate } from "@/modules/job-finder/sources/source.utils";

/**
 * Arbeitnow — public, keyless job board API (Europe-heavy, mixed remote/onsite).
 * Docs: https://www.arbeitnow.com/api/job-board-api
 *
 * Paginated and unsearchable, so pages are walked until the window is exhausted:
 * results are newest-first, which lets us stop as soon as a page falls entirely
 * behind `since` instead of pulling the whole board.
 */
@Injectable()
export class ArbeitnowSource implements JobSourceAdapter {
    readonly key = "arbeitnow";
    readonly name = "Arbeitnow";
    readonly requiresCredentials = false;

    private static readonly MAX_PAGES = 5;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const collected: NormalizedPosting[] = [];

        for (let page = 1; page <= ArbeitnowSource.MAX_PAGES; page++) {
            const payload = await fetchJson<ArbeitnowPayload>(
                `https://www.arbeitnow.com/api/job-board-api?page=${page}`
            );
            const jobs = payload.data ?? [];
            if (!jobs.length) break;

            const mapped = jobs.map((job) => this.map(job));
            collected.push(...mapped);

            // Newest-first: once a whole page predates the window, later pages will too.
            const newestOnPage = mapped.reduce<number>(
                (max, job) => Math.max(max, job.postedAt?.getTime() ?? 0),
                0
            );
            if (newestOnPage && newestOnPage < ctx.since.getTime()) {
                await ctx.log("debug", `Arbeitnow page ${page} is entirely older than the window — stopping`);
                break;
            }

            if (collected.length >= ctx.limit * 4) break;
        }

        await ctx.log("debug", `Arbeitnow returned ${collected.length} jobs across paged fetch`);
        return collected;
    }

    private map(job: ArbeitnowJob): NormalizedPosting {
        return {
            externalId: job.slug,
            title: job.title,
            company: (job.company_name ?? "").trim(),
            location: job.location?.trim() || undefined,
            isRemote: Boolean(job.remote),
            employmentType: job.job_types?.[0],
            url: job.url,
            applyUrl: job.url,
            description: clampText(stripHtml(job.description)),
            tags: job.tags ?? [],
            postedAt: toDate(job.created_at),
            raw: job,
        };
    }
}

interface ArbeitnowPayload {
    data?: ArbeitnowJob[];
}

interface ArbeitnowJob {
    slug: string;
    company_name?: string;
    title: string;
    description?: string;
    remote?: boolean;
    url: string;
    tags?: string[];
    job_types?: string[];
    location?: string;
    created_at?: number;
}
