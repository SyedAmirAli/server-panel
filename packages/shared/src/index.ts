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
  imapHost: string;
  imapUser: string;
  imapPassword: string;
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
  isActive?: boolean;
}

export interface MailboxView {
  id: string;
  address: string;
  imapHost: string;
  imapUser: string;
  smtpHost: string;
  smtpUser: string;
  isActive: boolean;
  lastSyncUid: number | null;
  createdAt: string;
}

/* ─── Mail messages ──────────────────────────────────────────── */
export interface MailMessageView {
  id: string;
  mailboxId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
}

export interface MailMessageDetailView extends MailMessageView {
  body: string;
  html: string | null;
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
