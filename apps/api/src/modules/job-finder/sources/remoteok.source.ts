import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, fetchJson, stripHtml, toDate } from "@/modules/job-finder/sources/source.utils";

/**
 * Remote OK — public, keyless feed of the full current board.
 *
 * The feed has no server-side search, so it is fetched whole and filtered
 * locally by the runner. Element 0 is a legal/attribution notice rather than a
 * job and is skipped.
 *
 * Attribution: Remote OK's API terms require crediting them with a followable
 * link back to the posting. The UI renders the source name and links to
 * `posting.url`, which satisfies this.
 */
@Injectable()
export class RemoteOkSource implements JobSourceAdapter {
    readonly key = "remoteok";
    readonly name = "Remote OK";
    readonly requiresCredentials = false;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const rows = await fetchJson<RemoteOkRow[]>("https://remoteok.com/api");
        const jobs = rows.filter((row): row is RemoteOkJob => Boolean(row && "id" in row && row.position));
        await ctx.log("debug", `Remote OK returned ${jobs.length} jobs (whole board, filtered locally)`);

        return jobs.map((job) => ({
            externalId: String(job.id),
            title: job.position,
            company: (job.company ?? "").trim(),
            location: job.location?.trim().replace(/,\s*$/, "") || "Remote",
            isRemote: true,
            salaryRaw: formatSalary(job.salary_min, job.salary_max),
            salaryMin: job.salary_min || undefined,
            salaryMax: job.salary_max || undefined,
            currency: job.salary_min || job.salary_max ? "USD" : undefined,
            url: job.url,
            applyUrl: job.apply_url || job.url,
            description: clampText(stripHtml(job.description)),
            tags: job.tags ?? [],
            postedAt: toDate(job.date ?? job.epoch),
            raw: job,
        }));
    }
}

/** Remote OK sends 0/0 when it has no salary data — treat that as "unknown". */
function formatSalary(min?: number, max?: number): string | undefined {
    if (!min && !max) return undefined;
    const fmt = (n: number) => `$${Math.round(n / 1000)}k`;
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    return fmt((min || max) as number);
}

type RemoteOkRow = Partial<RemoteOkJob> & { legal?: string };

interface RemoteOkJob {
    id: number | string;
    slug?: string;
    epoch?: number;
    date?: string;
    company?: string;
    position: string;
    tags?: string[];
    description?: string;
    location?: string;
    apply_url?: string;
    url: string;
    salary_min?: number;
    salary_max?: number;
}
