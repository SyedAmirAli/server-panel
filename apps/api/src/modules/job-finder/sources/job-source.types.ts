/**
 * Discovery adapter contract.
 *
 * Every source — public board API, credentialed aggregator, mailbox parser,
 * single-URL import — returns the same `NormalizedPosting[]`, so the pipeline
 * (dedupe → persist → score) is written once and never branches per provider.
 */

export interface NormalizedPosting {
    /** Provider's own id, when it has one — used to spot re-fetches of the same row. */
    externalId?: string;
    title: string;
    company: string;
    companyUrl?: string;
    location?: string;
    isRemote: boolean;
    employmentType?: string;
    salaryRaw?: string;
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    url: string;
    applyUrl?: string;
    applyEmail?: string;
    /** Plain text — adapters strip provider HTML before returning. */
    description?: string;
    tags?: string[];
    /** Provider-reported publish time. Missing means "cannot prove recency". */
    postedAt?: Date;
    /** Untouched provider payload, kept for debugging a misbehaving adapter. */
    raw?: unknown;
}

export type LogFn = (level: "debug" | "info" | "warn" | "error" | "success", message: string, data?: Record<string, unknown>) => Promise<void> | void;

export interface FetchContext {
    /** Only postings published at or after this instant are wanted (the 24h window). */
    since: Date;
    /** Role keywords to search/filter on. Empty means "no keyword filter". */
    keywords: string[];
    /** Preferred locations. Empty means "anywhere". */
    locations: string[];
    /** Upper bound on postings this adapter should return. */
    limit: number;
    /** Per-source config from the `job_sources` row. */
    config: Record<string, unknown>;
    /** Streams a line into the run's terminal log. */
    log: LogFn;
}

export interface JobSourceAdapter {
    readonly key: string;
    readonly name: string;
    /** True when the adapter needs API keys to work at all. */
    readonly requiresCredentials: boolean;
    /**
     * Whether the source is switched on the first time it is seen. Defaults to
     * true; set false for a source that is present but should not run until the
     * operator decides to enable it.
     */
    readonly defaultActive?: boolean;
    /**
     * False when a credentialed adapter is missing its keys. The runner skips
     * such sources with a log line instead of failing the whole run.
     */
    isReady(): boolean;
    fetchJobs(ctx: FetchContext): Promise<NormalizedPosting[]>;
}

/** DI token for the adapter collection. */
export const JOB_SOURCE_ADAPTERS = Symbol("JOB_SOURCE_ADAPTERS");
