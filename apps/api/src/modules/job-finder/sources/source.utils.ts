import { createHash } from "node:crypto";
import { NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";

/** Identifies this client to the boards we call — several ask for attribution. */
export const JOB_FINDER_USER_AGENT = "AppsZoneJobFinder/1.0 (+https://appszonebd.com)";

/** GET JSON with a timeout and a courteous UA. Throws with provider context. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...init,
            headers: { "User-Agent": JOB_FINDER_USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${hostOf(url)}`);
        return (await res.json()) as T;
    } catch (err) {
        if ((err as Error).name === "AbortError") throw new Error(`Timed out after ${timeoutMs}ms calling ${hostOf(url)}`);
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/**
 * Provider descriptions are HTML. Scoring reads them as prose, so collapse to
 * text — entities decoded, block boundaries preserved as newlines.
 */
export function stripHtml(html: string | null | undefined): string | undefined {
    if (!html) return undefined;
    const text = html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .trim();
    return text || undefined;
}

/** Parse the assorted date shapes boards emit (ISO, epoch seconds, epoch ms). */
export function toDate(value: unknown): Date | undefined {
    if (value == null) return undefined;

    if (typeof value === "number") {
        // Epoch seconds vs milliseconds — anything below ~1e12 is seconds.
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? undefined : d;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        if (/^\d+$/.test(trimmed)) return toDate(Number(trimmed));
        // Remotive emits "2026-08-05T09:45:42" with no zone — read it as UTC
        // rather than letting the server's local zone shift it a day.
        const normalized = /^\d{4}-\d{2}-\d{2}T[\d:]+$/.test(trimmed) ? `${trimmed}Z` : trimmed;
        const d = new Date(normalized);
        return Number.isNaN(d.getTime()) ? undefined : d;
    }

    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
    return undefined;
}

/**
 * Cross-source identity for a posting.
 *
 * Built from company + title + the URL's host/path (query strings carry
 * tracking params that differ per source), so the same job surfaced by two
 * boards collapses to one row.
 */
export function dedupeHash(posting: Pick<NormalizedPosting, "company" | "title" | "url">): string {
    const canonicalUrl = (() => {
        try {
            const u = new URL(posting.url);
            return `${u.host.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
        } catch {
            return posting.url.trim().toLowerCase();
        }
    })();

    const key = [normalizeKey(posting.company), normalizeKey(posting.title), canonicalUrl].join("|");
    return createHash("sha256").update(key).digest("hex");
}

function normalizeKey(value: string): string {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ") // "(Remote)", "(m/f/d)" and similar noise
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** True when the posting looks like a match for any of the role keywords. */
export function matchesKeywords(posting: NormalizedPosting, keywords: string[]): boolean {
    if (!keywords.length) return true;
    const haystack = [posting.title, posting.company, posting.description ?? "", (posting.tags ?? []).join(" ")]
        .join(" ")
        .toLowerCase();
    return keywords.some((kw) => haystack.includes(kw.toLowerCase().trim()));
}

/** Keep only postings the provider says were published inside the window. */
export function withinWindow(posting: NormalizedPosting, since: Date): boolean {
    // No timestamp means we cannot prove recency; the runner decides whether to
    // keep such rows via `allowUndated`.
    if (!posting.postedAt) return false;
    return posting.postedAt.getTime() >= since.getTime();
}

/** First email address in a blob of text — used to find "apply to …" addresses. */
export function findEmail(text: string | undefined): string | undefined {
    if (!text) return undefined;
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
    return m ? m[0].replace(/[.,;]$/, "") : undefined;
}

/** Truncate descriptions before they reach the model, keeping the informative head. */
export function clampText(text: string | undefined, max = 12_000): string | undefined {
    if (!text) return undefined;
    return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}
