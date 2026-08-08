import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, fetchJson, stripHtml, toDate } from "@/modules/job-finder/sources/source.utils";

/**
 * Remotive — public, keyless JSON API of curated remote roles.
 * Docs: https://remotive.com/api/remote-jobs
 *
 * Supports a single `search` term per call, so one request is issued per
 * keyword and the results are merged by the runner's dedupe step.
 */
@Injectable()
export class RemotiveSource implements JobSourceAdapter {
    readonly key = "remotive";
    readonly name = "Remotive";
    readonly requiresCredentials = false;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const queries = ctx.keywords.length ? ctx.keywords : [""];
        const collected: NormalizedPosting[] = [];

        for (const query of queries) {
            const url = new URL("https://remotive.com/api/remote-jobs");
            if (query) url.searchParams.set("search", query);
            url.searchParams.set("limit", String(Math.min(ctx.limit, 100)));

            const payload = await fetchJson<RemotivePayload>(url.toString());
            const jobs = payload.jobs ?? [];
            await ctx.log("debug", `Remotive returned ${jobs.length} jobs for "${query || "all"}"`);

            for (const job of jobs) {
                collected.push({
                    externalId: String(job.id),
                    title: job.title,
                    company: (job.company_name ?? "").trim(),
                    location: job.candidate_required_location || "Remote",
                    isRemote: true, // Remotive is a remote-only board.
                    employmentType: job.job_type?.replace(/_/g, "-"),
                    salaryRaw: job.salary?.trim() || undefined,
                    url: job.url,
                    applyUrl: job.url,
                    description: clampText(stripHtml(job.description)),
                    tags: job.tags ?? [],
                    postedAt: toDate(job.publication_date),
                    raw: job,
                });
            }
        }

        return collected;
    }
}

interface RemotivePayload {
    jobs?: Array<{
        id: number;
        url: string;
        title: string;
        company_name?: string;
        category?: string;
        tags?: string[];
        job_type?: string;
        publication_date?: string;
        candidate_required_location?: string;
        salary?: string;
        description?: string;
    }>;
}
