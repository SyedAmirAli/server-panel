import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, stripHtml, toDate, JOB_FINDER_USER_AGENT } from "@/modules/job-finder/sources/source.utils";

const SEARCH_URL = "https://unstop.com/api/public/opportunity/search-result";
const PER_PAGE = 30;
/** Stop paging once a page is entirely older than the window. */
const MAX_PAGES = 4;

/**
 * Unstop — India-focused jobs and internships.
 *
 * Unlike Remotive or Jobicy this is an **undocumented internal endpoint**, the
 * one Unstop's own site calls. It is public and unauthenticated, but nothing
 * obliges them to keep its shape, so every field is read defensively and a
 * change degrades to "no results from Unstop" rather than failing a run.
 */
@Injectable()
export class UnstopSource implements JobSourceAdapter {
    readonly key = "unstop";
    readonly name = "Unstop";
    readonly requiresCredentials = false;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const terms = ctx.keywords.length ? ctx.keywords : [""];
        const collected: NormalizedPosting[] = [];
        const seen = new Set<number>();

        for (const term of terms) {
            for (let page = 1; page <= MAX_PAGES; page++) {
                if (collected.length >= ctx.limit) break;

                const url = new URL(SEARCH_URL);
                url.searchParams.set("opportunity", "jobs");
                url.searchParams.set("per_page", String(PER_PAGE));
                url.searchParams.set("page", String(page));
                if (term) url.searchParams.set("searchTerm", term);

                const payload = await this.get(url.toString());
                const rows = payload?.data?.data ?? [];
                if (rows.length === 0) break;

                await ctx.log("debug", `Unstop page ${page} for "${term || "all"}": ${rows.length} row(s)`);

                let allStale = true;
                for (const row of rows) {
                    const postedAt = toDate(row.updated_at ?? row.created_at);
                    if (postedAt && postedAt >= ctx.since) allStale = false;
                    if (seen.has(row.id)) continue;
                    seen.add(row.id);

                    const detail = row.jobDetail ?? {};
                    const locations = Array.isArray(detail.locations) ? detail.locations.filter(Boolean) : [];

                    collected.push({
                        externalId: String(row.id),
                        title: (row.title ?? "").trim(),
                        company: (row.organisation?.name ?? "").trim(),
                        location: locations.join(", ") || undefined,
                        // Unstop marks remote through the location list rather than a flag.
                        isRemote: locations.some((l) => /remote|work from home/i.test(l)),
                        employmentType: typeof detail.type === "string" ? detail.type : undefined,
                        url: row.public_url ? `https://unstop.com/${row.public_url}` : "",
                        applyUrl: row.public_url ? `https://unstop.com/${row.public_url}` : undefined,
                        description: clampText(stripHtml(row.details ?? row.subtitle ?? "")),
                        tags: Array.isArray(row.filters)
                            ? row.filters.map((f) => f?.name).filter((n): n is string => Boolean(n))
                            : undefined,
                        postedAt,
                        raw: row,
                    });

                    if (collected.length >= ctx.limit) break;
                }

                // Results are newest-first, so a page with nothing in the window
                // means every later page is older still.
                if (allStale) break;
            }
        }

        // A posting with no URL cannot be applied to or deduped meaningfully.
        return collected.filter((p) => p.url && p.title);
    }

    private async get(url: string): Promise<UnstopPayload | null> {
        try {
            const res = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": JOB_FINDER_USER_AGENT,
                    Referer: "https://unstop.com/jobs",
                },
                signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) return null;
            return (await res.json()) as UnstopPayload;
        } catch {
            // Undocumented endpoint: treat any failure as "no results" so one
            // flaky source cannot take down a discovery run.
            return null;
        }
    }
}

interface UnstopPayload {
    data?: {
        data?: Array<{
            id: number;
            title?: string;
            public_url?: string;
            subtitle?: string;
            details?: string;
            updated_at?: string;
            created_at?: string;
            organisation?: { name?: string };
            jobDetail?: { locations?: string[]; type?: string };
            filters?: Array<{ name?: string }>;
        }>;
    };
}
