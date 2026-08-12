import { Injectable } from "@nestjs/common";
import { FetchContext, JobSourceAdapter, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { clampText, stripHtml, JOB_FINDER_USER_AGENT } from "@/modules/job-finder/sources/source.utils";

const SEARCH_URL = "https://www.foundit.in/middleware/jobsearch";
const PAGE_SIZE = 25;
const MAX_PAGES = 4;

/**
 * foundit.in (formerly Monster India).
 *
 * Another undocumented internal endpoint. Two quirks worth knowing:
 *
 * - It returns 400 "content negotiation failed" without a browser-shaped
 *   `Accept` header and a Referer, so both are sent deliberately.
 * - `updatedAt` is human text ("16 hours ago"), which cannot drive a 24-hour
 *   window. `createdAt`/`lastUpdated` carry epoch milliseconds and are used
 *   instead; the relative string is ignored.
 */
@Injectable()
export class FounditSource implements JobSourceAdapter {
    readonly key = "foundit";
    readonly name = "foundit.in";
    readonly requiresCredentials = false;
    /**
     * Off until the operator turns it on.
     *
     * foundit answers 403 to any client that identifies itself honestly, and 200
     * only when the User-Agent looks like a browser. That 403 is the site
     * declining automated access, and the fix — pretending to be Chrome — is
     * circumventing an access control rather than reading a public API. So the
     * adapter exists, identifies itself truthfully, and stays disabled rather
     * than quietly spoofing.
     *
     * The supported route to these listings is foundit's own job-alert emails,
     * which the mailbox parser can read.
     */
    readonly defaultActive = false;

    isReady(): boolean {
        return true;
    }

    async fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]> {
        const terms = ctx.keywords.length ? ctx.keywords : [""];
        const locations = ctx.locations.length ? ctx.locations.join(",") : "";
        const collected: NormalizedPosting[] = [];
        const seen = new Set<string>();

        for (const term of terms) {
            for (let page = 0; page < MAX_PAGES; page++) {
                if (collected.length >= ctx.limit) break;

                const url = new URL(SEARCH_URL);
                url.searchParams.set("start", String(page * PAGE_SIZE));
                url.searchParams.set("limit", String(PAGE_SIZE));
                if (term) url.searchParams.set("query", term);
                if (locations) url.searchParams.set("locations", locations);

                const { payload, status } = await this.get(url.toString());
                if (status === 403) {
                    await ctx.log(
                        "warn",
                        "foundit refused the request (403). It blocks clients that identify themselves as tools. " +
                            "Subscribe to foundit job alerts by email instead — the mailbox parser can read those."
                    );
                    return collected;
                }
                const rows = payload?.jobSearchResponse?.data ?? [];
                if (rows.length === 0) break;

                await ctx.log("debug", `foundit page ${page + 1} for "${term || "all"}": ${rows.length} row(s)`);

                let allStale = true;
                for (const row of rows) {
                    const postedAt = epochToDate(row.createdAt ?? row.lastUpdated);
                    if (!postedAt || postedAt >= ctx.since) allStale = false;

                    const id = String(row.jobId ?? row.id ?? "");
                    if (!id || seen.has(id)) continue;
                    seen.add(id);

                    const link = row.seoJdUrl
                        ? `https://www.foundit.in${row.seoJdUrl.startsWith("/") ? "" : "/"}${row.seoJdUrl}`
                        : row.redirectUrl || "";

                    collected.push({
                        externalId: id,
                        title: (row.title ?? "").trim(),
                        company: (row.companyName ?? "").trim(),
                        location: row.locations || undefined,
                        isRemote: /remote|work from home/i.test(`${row.locations ?? ""} ${row.title ?? ""}`),
                        employmentType: row.employmentTypes || undefined,
                        url: link,
                        applyUrl: link || undefined,
                        description: clampText(stripHtml(row.jobDescription ?? row.summary ?? "")),
                        tags: splitSkills(row.skills),
                        postedAt,
                        raw: row,
                    });

                    if (collected.length >= ctx.limit) break;
                }

                if (allStale) break;
            }
        }

        return collected.filter((p) => p.url && p.title);
    }

    private async get(url: string): Promise<{ payload: FounditPayload | null; status: number }> {
        try {
            const res = await fetch(url, {
                headers: {
                    // Without these the endpoint answers 400 rather than JSON.
                    Accept: "application/json, text/plain, */*",
                    Referer: "https://www.foundit.in/",
                    "User-Agent": JOB_FINDER_USER_AGENT,
                },
                signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) return { payload: null, status: res.status };
            return { payload: (await res.json()) as FounditPayload, status: res.status };
        } catch {
            return { payload: null, status: 0 };
        }
    }
}

/** foundit reports epoch milliseconds as a string. */
function epochToDate(value?: string | number): Date | undefined {
    if (value === undefined || value === null) return undefined;
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms <= 0) return undefined;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function splitSkills(skills?: string): string[] | undefined {
    if (!skills) return undefined;
    const tags = skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
    return tags.length ? tags : undefined;
}

interface FounditPayload {
    jobSearchResponse?: {
        data?: Array<{
            id?: string;
            jobId?: number | string;
            title?: string;
            companyName?: string;
            locations?: string;
            employmentTypes?: string;
            skills?: string;
            jobDescription?: string;
            summary?: string;
            seoJdUrl?: string;
            redirectUrl?: string;
            createdAt?: string;
            lastUpdated?: string;
        }>;
    };
}
