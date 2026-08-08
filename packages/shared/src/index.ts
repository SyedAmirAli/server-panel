/* Shared types + constants. Request validation lives in NestJS class DTOs
   (class-validator); these interfaces describe the same shapes for the SPA. */

/* ─── Global API response envelope ───────────────────────────── */
// Mutating responses (POST/PUT/PATCH/DELETE) and all errors use this envelope.
// GET/HEAD return the raw payload (no envelope).
export type ApiStatus = "success" | "error" | "warning" | "info" | "queued";

export interface ApiResponse<T = unknown> {
  status: ApiStatus;
  message: string;
  data: T;
}

/* ─── Admin auth ─────────────────────────────────────────────── */
export interface AdminLoginDto {
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  expiresIn: string;
}

/* ─── Send mail (shared by /v1/send and /admin/send) ─────────── */
export const MAIL_BODY_TYPES = ["PLAIN_TEXT", "EMBED_HTML"] as const;
export type MailBodyType = (typeof MAIL_BODY_TYPES)[number];

/** Attachment limits enforced on the API (and surfaced to the UI). */
export const ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB per file
  maxTotalBytes: 25 * 1024 * 1024, // 25 MB total
} as const;

export interface SendMailDto {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyType: MailBodyType;
  body: string;
}

export type SentMessageStatus = "queued" | "sent" | "failed";

export interface SentMessageView {
  id: string;
  from: string;
  to: string[];
  subject: string;
  status: SentMessageStatus;
  error: string | null;
  createdAt: string;
}

/* ─── API keys ───────────────────────────────────────────────── */
export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  /** Full API key (decrypted for admin). Null for keys created before encrypted storage. */
  secret: string | null;
  isActive: boolean;
  allowedFrom: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** Same shape as ApiKeyView when secret is guaranteed (create/refresh). */
export interface ApiKeySecretView extends ApiKeyView {
  secret: string;
}

/* ─── Storage: buckets ───────────────────────────────────────── */
export const STORAGE_PROVIDERS = ["s3", "r2", "minio", "other"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export interface CreateBucketDto {
  name: string;
  provider: StorageProvider;
  endpoint?: string;
  region?: string;
  bucketName: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

/** All fields optional; secret creds only re-encrypted when provided. */
export type UpdateBucketDto = Partial<CreateBucketDto>;

export interface BucketView {
  id: string;
  publicId: string;
  name: string;
  provider: StorageProvider;
  endpoint: string | null;
  region: string | null;
  bucketName: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | null;
  isActive: boolean;
  /** Folder prefixes with delete-protection enabled (no leading/trailing slash). */
  lockedPrefixes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BucketStats {
  publicId: string;
  objectCount: number;
  totalSize: number;
  /** Whether stats were fully enumerated or capped by a page limit. */
  truncated: boolean;
}

/* ─── Storage: API keys ──────────────────────────────────────── */
export interface CreateStorageKeyDto {
  name: string;
  /** Bucket publicIds this key may use. Empty = all buckets. */
  allowedBuckets?: string[];
  /** Bucket publicId used when a request omits bucketId. Must be in allowedBuckets (if set). */
  defaultBucketId?: string | null;
  /** Allowed request origins/domains. Empty = any. */
  allowedOrigins?: string[];
  /** Allowed client IPs/CIDRs. Empty = any. */
  allowedIps?: string[];
  /** ISO date; null/omitted = never expires. */
  expiresAt?: string | null;
}

export type UpdateStorageKeyDto = Partial<CreateStorageKeyDto>;

export interface StorageKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  secret: string | null;
  isActive: boolean;
  allowedBuckets: string[];
  defaultBucketId: string | null;
  allowedOrigins: string[];
  allowedIps: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface StorageKeySecretView extends StorageKeyView {
  secret: string;
}

/* ─── Storage: objects ───────────────────────────────────────── */
export interface StorageObjectView {
  id: string;
  bucketId: string;
  key: string;
  prefix: string | null;
  originalName: string;
  size: number;
  contentType: string;
  etag: string | null;
  isPrivate: boolean;
  convertedWebp: boolean;
  compressed: boolean;
  quality: number | null;
  createdAt: string;
}

/** A single entry returned when browsing a bucket live (folder or file). */
export interface StorageListEntry {
  type: "folder" | "file";
  /** Full key for files; folder prefix (ending in /) for folders. */
  key: string;
  /** Display name (last path segment). */
  name: string;
  size?: number;
  lastModified?: string;
  etag?: string;
}

export interface StorageListResult {
  prefix: string;
  entries: StorageListEntry[];
  /** Continuation token for the next page (live listings), if any. */
  nextToken: string | null;
}

export interface UploadResult {
  key: string;
  bucketId: string;
  /** Primary URL: custom/CDN domain for public objects, presigned URL for private. */
  url: string;
  /** Provider endpoint URL (e.g. Cloudflare account URL). Null for private objects. */
  endpointUrl: string | null;
  /** Present only for private objects (presigned, expiring). */
  presigned: boolean;
  expiresIn: number | null;
  object: StorageObjectView;
}

/* ─── Storage: ZIP jobs ──────────────────────────────────────── */
export type ZipJobStatus = "pending" | "processing" | "ready" | "error" | "cancelled";

export interface ZipJobView {
  id: string;
  bucketId: string;
  prefix: string | null;
  status: ZipJobStatus;
  totalBytes: number;
  processedBytes: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  createdAt: string;
}

/* ─── Email configs (SMTP) ───────────────────────────────────── */
export interface EmailConfigTlsOptions {
  rejectUnauthorized?: boolean;
}

export interface EmailConfigView {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  tls: EmailConfigTlsOptions | null;
  requireTLS: boolean;
  secure: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ─── Mailboxes ──────────────────────────────────────────────── */
export interface MailboxDto {
  address: string;
  displayName?: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPassword: string;
  isActive?: boolean;
}

export interface MailboxView {
  id: string;
  address: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  isActive: boolean;
  lastSyncUid: number | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailboxConnectionTestResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

/* ─── Mail messages ──────────────────────────────────────────── */
export interface MailMessageView {
  id: string;
  uid: number | null;
  mailboxId: string;
  messageId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  syncedAt: string;
}

export interface MailAttachmentMeta {
  filename: string | null;
  contentType: string;
  size: number;
}

export interface MailMessageDetailView extends MailMessageView {
  body: string;
  html: string | null;
  flags: string[];
  attachments: MailAttachmentMeta[];
}

/* ─── Dashboard stats ────────────────────────────────────────── */
export type DashboardPresetPeriod = "today" | "week" | "month" | "year" | "all";
export type DashboardPeriod = DashboardPresetPeriod | "custom";

export interface DashboardDateRange {
  period: DashboardPeriod;
  offset: number;
  from: string | null;
  to: string;
}

export interface DashboardStats {
  range: DashboardDateRange;
  /** All-time resource counts (not filtered by the selected window). */
  inventory: {
    totalApiKeys: number;
    activeApiKeys: number;
    totalMailboxes: number;
    activeMailboxes: number;
    totalEmailConfigs: number;
    activeEmailConfigs: number;
  };
  /** Activity within the selected date window. */
  activity: {
    mailMessages: number;
    sentMessages: number;
    sent: number;
    sentFailed: number;
    queued: number;
    auditLogs: number;
  };
  /** Live counters (current state, not window-scoped). */
  snapshot: {
    inboxUnread: number;
    sentQueued: number;
  };
}

/* ─── Job Finder / Job Application Assistant ─────────────────── */
export * from "./job-finder";
