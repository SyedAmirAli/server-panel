/* AI Studio — resume builder, cover letters and the data assistant.
   Additive module: nothing here alters or re-declares existing exports.

   The `Candidate*` shapes in ./job-finder describe the *derived JSON* view of a
   profile, which Job Finder scoring reads. The `Profile*` shapes below are the
   relational rows those are composed from — they carry ids, so they can be
   edited one at a time and referenced from a generated document. */

/* ─── Relational candidate detail ────────────────────────────── */

export interface ProfileProject {
    id: string;
    profileId: string;
    name: string;
    description: string | null;
    role: string | null;
    period: string | null;
    /** Tech tags. The ranking key for tailoring — this is where a Laravel role and a Next.js role part ways. */
    stack: string[];
    metrics: Array<[string, string]> | null;
    /** Attribution as written (solo vs team) — used to avoid inflating ownership. */
    note: string | null;
    url: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProfileExperience {
    id: string;
    profileId: string;
    company: string;
    position: string;
    /** Verbatim from the CV — never recomputed into a new duration. */
    period: string;
    location: string | null;
    /** Part-time stays part-time in every generated document. */
    employmentType: string | null;
    points: string[];
    stack: string[] | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProfileEducation {
    id: string;
    profileId: string;
    institution: string;
    degree: string;
    /** Verbatim from the CV, like ProfileExperience.period. */
    period: string;
    location: string | null;
    note: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export type SkillCategory = "language" | "framework" | "database" | "tooling" | "cloud" | "other";

export interface ProfileSkill {
    id: string;
    profileId: string;
    name: string;
    category: SkillCategory | string | null;
    level: string | null;
    highlighted: boolean;
    sortOrder: number;
    createdAt: string;
}

export type ProfileLinkKind = "linkedin" | "github" | "portfolio" | "other";

export interface ProfileLink {
    id: string;
    profileId: string;
    label: string;
    url: string;
    kind: ProfileLinkKind;
    sortOrder: number;
    createdAt: string;
}

/* ─── Supporting information & the review queue ──────────────── */

export type InfoItemKind = "pdf" | "image" | "textfile" | "note";
export type ExtractionStatus = "pending" | "done" | "failed" | "skipped";

export interface ProfileInfoItem {
    id: string;
    profileId: string;
    /** "note" is typed straight in and skips extraction — it is already text. */
    kind: InfoItemKind;
    title: string | null;
    /** Extracted or typed text, kept verbatim so any derived fact traces back to its source. */
    rawText: string | null;
    bucketId: string | null;
    folder: string | null;
    fileName: string | null;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    extractionStatus: ExtractionStatus;
    extractionError: string | null;
    model: string | null;
    extractedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export type FactTargetType = "project" | "experience" | "skill" | "link" | "field";
export type FactProposalStatus = "pending" | "accepted" | "rejected";

/**
 * Nothing merges into a profile without review. One bad OCR pass would otherwise
 * quietly poison every resume generated afterwards, and nobody rereads the
 * profile before hitting Execute.
 */
export interface ProfileFactProposal {
    id: string;
    profileId: string;
    infoItemId: string | null;
    targetType: FactTargetType;
    /** The candidate row itself, shaped for targetType. */
    payload: Record<string, unknown>;
    /** Model's own confidence — orders the review queue, nothing more. */
    confidence: number | null;
    status: FactProposalStatus;
    reviewedAt: string | null;
    createdRowId: string | null;
    model: string | null;
    createdAt: string;
}

/* ─── Generated documents ────────────────────────────────────── */

export type DocumentKind = "resume" | "cover_letter";
export type DocumentFormat = "pdf" | "text";

/** One numbered, addressable block of a rendered document. */
export interface DocumentBlock {
    /** Stable id. The gutter number is display for this — visual line numbers
     *  renumber on every edit, so "also fix line 24" would hit the wrong text. */
    id: string;
    /** 1-based number shown in the preview gutter. */
    number: number;
    section: string;
    kind: "heading" | "bullet" | "paragraph" | "meta";
    text: string;
    /** Profile rows this block was derived from — the fabrication guard's audit trail. */
    sourceIds?: string[];
    /** Set when the guard could not trace this claim back to the profile. */
    unsupported?: boolean;
}

export interface ResumeDocumentContent {
    name: string;
    headline: string | null;
    contacts: string[];
    summary: string[];
    experience: ProfileExperience[];
    projects: ProfileProject[];
    skills: ProfileSkill[];
    education: ProfileEducation[];
}

export interface ResumeDocument {
    id: string;
    profileId: string;
    postingId: string | null;
    applicationId: string | null;
    kind: DocumentKind;
    format: DocumentFormat;
    title: string;
    /** Immutable snapshot. Deliberately not a read-through to live profile rows:
     *  once a PDF has gone to an employer, later edits must not make our records
     *  disagree with their copy. */
    contentJson: ResumeDocumentContent;
    blocks: DocumentBlock[] | null;
    bucketId: string | null;
    folder: string | null;
    fileName: string | null;
    storageKey: string | null;
    sizeBytes: number | null;
    pageCount: number | null;
    warnings: string[] | null;
    model: string | null;
    createdAt: string;
    updatedAt: string;
    /** Presigned link, attached by the endpoint rather than stored. */
    downloadUrl?: string;
}

/* ─── Tailoring ──────────────────────────────────────────────── */

/** Why an item was kept or dropped — shown so the user can override before Execute. */
export interface TailoringDecision {
    itemId: string;
    itemType: "project" | "experience";
    included: boolean;
    /** Deterministic tag-overlap score, computed before the model is consulted. */
    overlapScore: number;
    matchedTags: string[];
    reason: string;
}

export interface TailoringResult {
    decisions: TailoringDecision[];
    /** Claims the guard could not trace back to the profile. */
    unsupportedClaims: string[];
    /** Technologies named in output but absent from the profile — hard-rejected. */
    rejectedTechnologies: string[];
    model: string | null;
}

/* ─── Studio conversations ───────────────────────────────────── */

export type StudioMode = "general" | "candidate" | "tailoring";
export type StudioRole = "user" | "assistant" | "tool";

/** The model names an entity; the UI maps it to a route. Asked for a URL
 *  directly, a model invents paths that 404. */
export interface EntityReference {
    type: "message" | "mailbox" | "posting" | "application" | "candidate" | "document" | "emailConfig" | "bucket";
    id: string;
    label?: string;
}

export interface StudioMessage {
    id: string;
    conversationId: string;
    role: StudioRole;
    content: string | null;
    toolName: string | null;
    toolArgs: Record<string, unknown> | null;
    toolResult: Record<string, unknown> | null;
    references: EntityReference[] | null;
    model: string | null;
    tokens: number | null;
    createdAt: string;
}

export interface StudioConversation {
    id: string;
    profileId: string | null;
    postingId: string | null;
    mode: StudioMode;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages?: StudioMessage[];
}

/* ─── Streaming ──────────────────────────────────────────────── */

/** SSE frame types for the chat stream. */
export type StudioStreamEvent =
    | { type: "token"; text: string }
    | { type: "tool_call"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; summary: string }
    | { type: "references"; references: EntityReference[] }
    | { type: "done"; messageId: string }
    | { type: "error"; message: string };
