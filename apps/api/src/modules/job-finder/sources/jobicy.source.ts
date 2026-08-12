import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, fetchJson, stripHtml, toDate } from "@/modules/job-finder/sources/source.utils";

/**
 * Jobicy — public, keyless remote-jobs API with tag filtering.
 * Docs: https://jobi.cy/apidocs
 *
 * Attribution: Jobicy's notice asks that they be credited with a direct link to
 * the source; the UI shows the source name and links to `posting.url`.
 */
@Injectable()
export class JobicySource implements JobSourceAdapter {
    readonly key = "jobicy";
    readonly name = "Jobicy";
    readonly requiresCredentials = false;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const tags = ctx.keywords.length ? ctx.keywords : [""];
        const collected: NormalizedPosting[] = [];

        for (const tag of tags) {
            const url = new URL("https://jobicy.com/api/v2/remote-jobs");
            url.searchParams.set("count", String(Math.min(ctx.limit, 50)));
            if (tag) url.searchParams.set("tag", tag);

            const payload = await fetchJson<JobicyPayload>(url.toString());
            const jobs = payload.jobs ?? [];
            await ctx.log("debug", `Jobicy returned ${jobs.length} jobs for tag "${tag || "all"}"`);

            for (const job of jobs) {
                collected.push({
                    externalId: String(job.id),
                    title: job.jobTitle,
                    company: (job.companyName ?? "").trim(),
                    location: job.jobGeo || "Remote",
                    isRemote: true, // Jobicy is a remote-only board.
                    employmentType: job.jobType?.[0],
                    salaryRaw: formatSalary(job),
                    salaryMin: numeric(job.annualSalaryMin),
                    salaryMax: numeric(job.annualSalaryMax),
                    currency: job.salaryCurrency,
                    url: job.url,
                    applyUrl: job.url,
                    description: clampText(stripHtml(job.jobDescription ?? job.jobExcerpt)),
                    tags: [...(job.jobIndustry ?? []), ...(job.jobLevel ? [job.jobLevel] : [])],
                    postedAt: toDate(job.pubDate),
                    raw: job,
                });
            }
        }

        return collected;
    }
}

function numeric(value: unknown): number | undefined {
    const n = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

function formatSalary(job: JobicyJob): string | undefined {
    const min = numeric(job.annualSalaryMin);
    const max = numeric(job.annualSalaryMax);
    if (!min && !max) return undefined;
    const cur = job.salaryCurrency ?? "USD";
    if (min && max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}`;
    return `${cur} ${(min || max)!.toLocaleString()}`;
}

interface JobicyPayload {
    jobs?: JobicyJob[];
}

interface JobicyJob {
    id: number | string;
    url: string;
    jobTitle: string;
    companyName?: string;
    companyLogo?: string;
    jobIndustry?: string[];
    jobType?: string[];
    jobGeo?: string;
    jobLevel?: string;
    jobExcerpt?: string;
    jobDescription?: string;
    pubDate?: string;
    annualSalaryMin?: string | number;
    annualSalaryMax?: string | number;
    salaryCurrency?: string;
}
