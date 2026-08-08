import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, fetchJson, stripHtml, toDate } from "@/modules/job-finder/sources/source.utils";

/**
 * Adzuna — large multi-country aggregator, including non-remote roles.
 * Docs: https://developer.adzuna.com/
 *
 * Requires free credentials (`ADZUNA_APP_ID` / `ADZUNA_APP_KEY`). Until those
 * are set, `isReady()` is false and the runner skips this source with a log
 * line rather than failing the run.
 */
@Injectable()
export class AdzunaSource implements JobSourceAdapter {
    readonly key = "adzuna";
    readonly name = "Adzuna";
    readonly requiresCredentials = true;

    constructor(private readonly config: ConfigService) {}

    private get appId(): string {
        return this.config.get<string>("ADZUNA_APP_ID")?.trim() ?? "";
    }

    private get appKey(): string {
        return this.config.get<string>("ADZUNA_APP_KEY")?.trim() ?? "";
    }

    isReady(): boolean {
        return Boolean(this.appId && this.appKey);
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        if (!this.isReady()) return [];

        // Adzuna is country-partitioned; default to a broad English-language set.
        const countries = asStringArray(ctx.config.country ?? ctx.config.countries) ?? ["gb", "us"];
        const queries = ctx.keywords.length ? ctx.keywords : [""];
        const maxDays = Math.max(1, Math.ceil((Date.now() - ctx.since.getTime()) / 86_400_000));
        const collected: NormalizedPosting[] = [];

        for (const country of countries) {
            for (const query of queries) {
                const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
                url.searchParams.set("app_id", this.appId);
                url.searchParams.set("app_key", this.appKey);
                url.searchParams.set("results_per_page", String(Math.min(ctx.limit, 50)));
                url.searchParams.set("max_days_old", String(maxDays));
                url.searchParams.set("content-type", "application/json");
                if (query) url.searchParams.set("what", query);
                if (ctx.locations.length) url.searchParams.set("where", ctx.locations[0]);

                const payload = await fetchJson<AdzunaPayload>(url.toString());
                const jobs = payload.results ?? [];
                await ctx.log("debug", `Adzuna[${country}] returned ${jobs.length} jobs for "${query || "all"}"`);

                for (const job of jobs) {
                    const location = job.location?.display_name;
                    collected.push({
                        externalId: String(job.id),
                        title: job.title ?? "",
                        company: (job.company?.display_name ?? "").trim(),
                        location,
                        isRemote: /remote/i.test(`${job.title ?? ""} ${location ?? ""}`),
                        employmentType: job.contract_time ?? job.contract_type ?? undefined,
                        salaryRaw: formatSalary(job),
                        salaryMin: job.salary_min ? Math.round(job.salary_min) : undefined,
                        salaryMax: job.salary_max ? Math.round(job.salary_max) : undefined,
                        url: job.redirect_url ?? "",
                        applyUrl: job.redirect_url ?? undefined,
                        description: clampText(stripHtml(job.description)),
                        tags: job.category?.label ? [job.category.label] : [],
                        postedAt: toDate(job.created),
                        raw: job,
                    });
                }
            }
        }

        return collected.filter((job) => job.title && job.url);
    }
}

function asStringArray(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
        const list = value.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
        return list.length ? list : undefined;
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return undefined;
}

function formatSalary(job: AdzunaJob): string | undefined {
    const { salary_min: min, salary_max: max } = job;
    if (!min && !max) return undefined;
    const fmt = (n: number) => Math.round(n).toLocaleString();
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    return fmt((min || max) as number);
}

interface AdzunaPayload {
    results?: AdzunaJob[];
}

interface AdzunaJob {
    id: number | string;
    title?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    category?: { label?: string };
    description?: string;
    created?: string;
    redirect_url?: string;
    salary_min?: number;
    salary_max?: number;
    contract_time?: string;
    contract_type?: string;
}
