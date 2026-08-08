import { api, getToken } from "@/lib/api";
import type {
    CandidateProfile,
    JobApplication,
    JobFinderSettings,
    JobMatch,
    JobPosting,
    JobRun,
    JobRunLog,
    JobSource,
} from "@appszone/shared";

/** Job Finder API surface — all routes live under /admin/job-finder. */
const BASE = "/admin/job-finder";

export interface PostingRow extends JobPosting {
    sourceKey: string | null;
    sourceName: string | null;
    match: JobMatch | null;
}

export interface PostingDetail extends PostingRow {
    matches?: JobMatch[];
    applications: JobApplication[];
}

export interface PostingsPage {
    data: PostingRow[];
    total: number;
    currentPage: number;
    perPage: number;
    lastPage: number;
    hasMore: boolean;
}

export interface JobFinderOverview {
    postings: { total: number; shortlisted: number; applied: number; strongMatches: number };
    profile: { id: string; name: string; updatedAt: string } | null;
    latestRun: JobRun | null;
    isRunning: boolean;
    schedule: { enabled: boolean; cronExpression: string; nextRun: string | null };
}

export interface PostingFilters {
    page?: number;
    limit?: number;
    minStars?: number;
    status?: string;
    search?: string;
    isRemote?: boolean;
    sourceId?: string;
}

export const jobsApi = {
    overview: () => api<JobFinderOverview>(`${BASE}/overview`),

    /* Postings */
    listPostings(filters: PostingFilters = {}) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
        }
        return api<PostingsPage>(`${BASE}/postings?${params.toString()}`);
    },
    getPosting: (id: string) => api<PostingDetail>(`${BASE}/postings/${id}`),
    setPostingStatus: (id: string, status: string) =>
        api<JobPosting>(`${BASE}/postings/${id}/status`, { method: "PATCH", body: { status } }),
    rescore: (id: string) => api<JobMatch>(`${BASE}/postings/${id}/rescore`, { method: "POST" }),
    deletePosting: (id: string) => api<{ id: string }>(`${BASE}/postings/${id}`, { method: "DELETE" }),
    importUrl: (url: string) => api<PostingDetail>(`${BASE}/postings/import-url`, { method: "POST", body: { url } }),

    /* Applications */
    generateApplication: (postingId: string) =>
        api<JobApplication>(`${BASE}/postings/${postingId}/application`, { method: "POST" }),
    updateApplication: (id: string, body: Partial<Pick<JobApplication, "subject" | "body" | "toEmail" | "status">>) =>
        api<JobApplication>(`${BASE}/applications/${id}`, { method: "PUT", body }),
    markSent: (id: string) => api<JobApplication>(`${BASE}/applications/${id}/sent`, { method: "POST", body: {} }),
    deleteApplication: (id: string) => api<{ id: string }>(`${BASE}/applications/${id}`, { method: "DELETE" }),

    /* Runs */
    startRun: () => api<{ id: string }>(`${BASE}/runs`, { method: "POST", body: {} }),
    listRuns: () => api<JobRun[]>(`${BASE}/runs`),
    latestRun: () => api<JobRun | null>(`${BASE}/runs/latest`),
    getRun: (id: string) => api<JobRun>(`${BASE}/runs/${id}`),

    /* Sources */
    listSources: () => api<JobSource[]>(`${BASE}/sources`),
    updateSource: (id: string, body: { isActive?: boolean; config?: Record<string, unknown> }) =>
        api<JobSource>(`${BASE}/sources/${id}`, { method: "PATCH", body }),

    /* Settings + profile */
    getSettings: () => api<JobFinderSettings & { nextRun: string | null }>(`${BASE}/settings`),
    updateSettings: (body: Partial<JobFinderSettings>) =>
        api<JobFinderSettings & { nextRun: string | null }>(`${BASE}/settings`, { method: "PUT", body }),
    activeProfile: () => api<CandidateProfile | null>(`${BASE}/profiles/active`),
    importProfile: (body: { path?: string; force?: boolean } = {}) =>
        api<CandidateProfile>(`${BASE}/profiles/import`, { method: "POST", body }),
};

/**
 * Follow a run's log live.
 *
 * Deliberately not `EventSource`: that cannot send an Authorization header, and
 * the alternative — accepting a token from the query string — would mean
 * loosening the shared AdminGuard. Reading the SSE body through `fetch` keeps
 * the existing auth surface exactly as it was.
 *
 * Returns an abort function.
 */
export function streamRunLogs(
    runId: string,
    handlers: { onLog: (log: JobRunLog) => void; onDone?: () => void; onError?: (err: Error) => void }
): () => void {
    const base = import.meta.env.VITE_API_BASE_URL || "/api/v1";
    const controller = new AbortController();

    void (async () => {
        try {
            const res = await fetch(`${base}${BASE}/runs/${runId}/stream`, {
                headers: {
                    Accept: "text/event-stream",
                    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
                },
                signal: controller.signal,
            });

            if (!res.ok || !res.body) throw new Error(`Log stream failed (${res.status})`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // SSE frames are separated by a blank line.
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";

                for (const frame of frames) {
                    const payload = frame
                        .split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trim())
                        .join("");
                    if (!payload) continue;
                    try {
                        handlers.onLog(JSON.parse(payload) as JobRunLog);
                    } catch {
                        // Ignore a partial/garbled frame rather than killing the stream.
                    }
                }
            }
            handlers.onDone?.();
        } catch (err) {
            if ((err as Error).name !== "AbortError") handlers.onError?.(err as Error);
        }
    })();

    return () => controller.abort();
}
