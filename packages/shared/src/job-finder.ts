/* Job Finder / Job Application Assistant — shared shapes.
   Additive module: nothing here alters or re-declares existing exports. */

/* ─── Candidate profile ──────────────────────────────────────── */

export interface CandidateSkill {
    name: string;
    /** e.g. "language", "framework", "database", "tooling", "cloud". */
    category?: string;
    highlighted?: boolean;
}

export interface CandidateExperience {
    company: string;
    position: string;
    /** Verbatim from the CV — never recomputed into a new duration. */
    period: string;
    location?: string;
    /** Employment nature as the CV states it (full-time, part-time, internship…). */
    employmentType?: string;
    points: string[];
    stack?: string[];
}

export interface CandidateEducation {
    institution: string;
    degree: string;
    period: string;
    location?: string;
}

export interface CandidateProject {
    name: string;
    description: string;
    stack?: string[];
    /** Attribution preserved as written (solo vs team) — used to avoid inflating ownership. */
    note?: string;
    metrics?: Array<[string, string]>;
}

export interface CandidateLink {
    label: string;
    url: string;
}

export interface CandidateProfile {
    id: string;
    name: string;
    headline: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    timezone: string | null;
    availability: string | null;
    summary: string | null;
    /** Free-form "about me" — Studio chat context, never printed verbatim. */
    bio: string | null;
    titles: string[];
    /** Roles actually being targeted, which is not always what the headline says. */
    preferredTitles: string[] | null;
    skills: CandidateSkill[];
    experience: CandidateExperience[];
    education: CandidateEducation[];
    projects: CandidateProject[];
    certifications: string[] | null;
    languages: string[] | null;
    links: CandidateLink[] | null;
    sourceType: "repo" | "pdf" | "paste";
    sourcePath: string | null;
    sourceHash: string | null;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

/* ─── Sources ────────────────────────────────────────────────── */

export type JobSourceAdapter =
    | "remotive"
    | "remoteok"
    | "arbeitnow"
    | "jobicy"
    | "adzuna"
    | "url-import"
    | "linkedin-email";

export interface JobSource {
    id: string;
    key: string;
    name: string;
    adapter: JobSourceAdapter;
    isActive: boolean;
    config: Record<string, unknown> | null;
    requiresCredentials: boolean;
    credentialsReady: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunError: string | null;
}

/* ─── Postings & matches ─────────────────────────────────────── */

export type JobPostingStatus = "new" | "scored" | "shortlisted" | "applied" | "dismissed" | "archived";

export interface JobPosting {
    id: string;
    sourceId: string | null;
    /** Flattened from the joined source row by the list/detail endpoints. */
    sourceKey?: string | null;
    sourceName?: string | null;
    externalId: string | null;
    title: string;
    company: string;
    companyUrl: string | null;
    location: string | null;
    isRemote: boolean;
    employmentType: string | null;
    salaryRaw: string | null;
    url: string;
    applyUrl: string | null;
    applyEmail: string | null;
    description: string | null;
    tags: string[] | null;
    postedAt: string | null;
    discoveredAt: string;
    status: JobPostingStatus;
    match?: JobMatch | null;
}

export type JobMatchVerdict = "strong" | "good" | "stretch" | "weak";

export interface JobMatch {
    id: string;
    postingId: string;
    profileId: string;
    /** 1–5, what the list UI renders. */
    stars: number;
    /** 0–100, the finer ordering key behind the stars. */
    score: number;
    verdict: JobMatchVerdict | null;
    summary: string | null;
    strengths: string[] | null;
    /** Requirements the CV does not evidence — shown to the candidate, never to a recruiter. */
    gaps: string[] | null;
    matchedSkills: string[] | null;
    missingSkills: string[] | null;
    model: string | null;
    scoredAt: string;
}

/* ─── Applications ───────────────────────────────────────────── */

export type JobApplicationStatus = "draft" | "ready" | "sent" | "replied" | "rejected";

export interface JobApplication {
    id: string;
    postingId: string;
    profileId: string;
    status: JobApplicationStatus;
    channel: "email" | "url";
    toEmail: string | null;
    subject: string | null;
    body: string | null;
    gapsNote: string | null;
    model: string | null;
    sentMessageId: string | null;
    sentAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/* ─── Runs & logs ────────────────────────────────────────────── */

export type JobRunStatus = "running" | "success" | "partial" | "failed" | "cancelled";
export type JobRunLogLevel = "debug" | "info" | "warn" | "error" | "success";

export interface JobRunStats {
    discovered: number;
    deduped: number;
    inserted: number;
    scored: number;
    errors: number;
}

export interface JobRunLog {
    id: string;
    runId: string;
    seq: number;
    level: JobRunLogLevel;
    source: string | null;
    message: string;
    data: Record<string, unknown> | null;
    createdAt: string;
}

export interface JobRun {
    id: string;
    trigger: "manual" | "cron";
    status: JobRunStatus;
    startedAt: string;
    finishedAt: string | null;
    sourcesRun: string[] | null;
    stats: JobRunStats | null;
    error: string | null;
    logs?: JobRunLog[];
}

/* ─── Settings ───────────────────────────────────────────────── */

export interface JobFinderSettings {
    id: string;
    cronEnabled: boolean;
    cronExpression: string;
    lookbackHours: number;
    minStars: number;
    maxJobsPerRun: number;
    scoringModel: string;
    writingModel: string;
    extractionModel: string;
    keywords: string[] | null;
    locations: string[] | null;
    excludeCompanies: string[] | null;
    activeProfileId: string | null;
}
