import { ForbiddenException, Injectable, Logger, PayloadTooLargeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import type { ApiKey, AuditLog } from "@prisma/client";
import { ATTACHMENT_LIMITS, type SendMailDto, type SentMessageView } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import HelperClass from "@/common/HelperClass";

export enum MailAuditLogAction {
    SEND_SUCCESS = "mail.send.success",
    SEND_FAILED = "mail.send.failed",

    ACTOR_TYPE_API_KEY = "apikey",
    ACTOR_TYPE_SYSTEM = "system",

    ENTITY_TYPE_SENT_MESSAGE = "sentMessage",
    ENTITY_TYPE_AUDIT_LOG = "auditLog",
    ENTITY_TYPE_EMAIL_CONFIG = "emailConfig",
}

export interface UploadedAttachment {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

export type FireAuditLogAction =
    | "send.success"
    | "send.failed"
    | "send.queued"
    | "send.sender.username.notfound"
    | "send.transport.error";

@Injectable()
export class MailsService {
    private readonly logger = new Logger(MailsService.name);
    private transporter: Transporter | null = null;

    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

    // api {POST} -> /v1/mails/send
    async send(
        apiKey: ApiKey,
        dto: SendMailDto,
        attachments: UploadedAttachment[],
        headers: any
    ): Promise<SentMessageView> {
        this.assertSenderAllowed(apiKey, dto.from);
        this.assertAttachmentsWithinLimits(attachments);

        // Persist first so the message is tracked even if delivery fails.
        const record = await this.prisma.sentMessage.create({
            data: {
                apiKeyId: apiKey.id,
                from: dto.from,
                to: dto.to,
                cc: dto.cc ?? undefined,
                bcc: dto.bcc ?? undefined,
                subject: dto.subject,
                status: "queued",
            },
        });

        const fireAuditLog = await this.fireAuditLog({ headers, apiKey, record, dto, attachments });
        const transport = await this.getTransporter(dto?.from, fireAuditLog);

        if (!transport) {
            // No SMTP configured yet (Mailcow not wired) — leave it queued.
            this.logger.warn(`SMTP not configured; message ${record.id} stored as queued only`);

            // create a audit log for the failed send
            await fireAuditLog("send.sender.username.notfound");

            return this.toView(record.id, dto, "queued", null);
        }

        try {
            await transport.transporter.sendMail({
                from: this.formatFromAddress(dto.from, transport.senderName),
                to: dto.to,
                cc: dto.cc,
                bcc: dto.bcc,
                subject: dto.subject,
                text: dto.bodyType === "PLAIN_TEXT" ? dto.body : undefined,
                html: dto.bodyType === "EMBED_HTML" ? dto.body : undefined,
                attachments: attachments.map((a) => ({
                    filename: a.originalname,
                    content: a.buffer,
                    contentType: a.mimetype,
                })),
            });
            await this.prisma.sentMessage.update({ where: { id: record.id }, data: { status: "sent" } });

            // Create audit log
            await fireAuditLog("send.success");

            return this.toView(record.id, dto, "sent", null);
        } catch (err) {
            const error = err instanceof Error ? err.message : "Unknown send error";
            await this.prisma.sentMessage.update({ where: { id: record.id }, data: { status: "failed", error } });

            // Create audit log
            await fireAuditLog("send.failed", error);
            this.logger.error(`Send failed for ${record.id}: ${error}`);

            return this.toView(record.id, dto, "failed", error);
        }
    }

    /**
     * =========================================================================
     * All Private Methods (including functions, variables, classes, etc.) should be helper functions and never used outside of this service.
     * =========================================================================
     */

    private async fireAuditLog({
        headers,
        apiKey,
        record,
        dto,
        attachments,
    }: {
        headers: any;
        apiKey: ApiKey;
        record: any;
        dto: SendMailDto;
        attachments?: any;
    }): Promise<(action: FireAuditLogAction, error?: any, metadata?: any) => Promise<void>> {
        return async (action, error, metadata) => {
            if (action === "send.success") {
                await this.createAuditLog({
                    headers,
                    action: MailAuditLogAction.SEND_SUCCESS,
                    actorType: MailAuditLogAction.ACTOR_TYPE_API_KEY,
                    actorId: apiKey.id,
                    entityType: MailAuditLogAction.ENTITY_TYPE_SENT_MESSAGE,
                    entityId: record.id,
                    metadata: dto,
                    message: this.buildSendSuccessAuditMessage(record.id, apiKey, dto, attachments),
                });
            }
            if (action === "send.failed") {
                await this.createAuditLog({
                    headers,
                    action: MailAuditLogAction.SEND_FAILED,
                    actorType: MailAuditLogAction.ACTOR_TYPE_API_KEY,
                    actorId: apiKey.id,
                    entityType: MailAuditLogAction.ENTITY_TYPE_SENT_MESSAGE,
                    entityId: record.id,
                    metadata: dto,
                    message: this.buildSendFailedAuditMessage(record.id, apiKey, dto, attachments, error),
                });
            }
            if (action === "send.queued") {
            }
            if (action === "send.sender.username.notfound") {
                await this.createAuditLog({
                    metadata,
                    actorId: "system",
                    action: MailAuditLogAction.SEND_FAILED,
                    actorType: MailAuditLogAction.ACTOR_TYPE_SYSTEM,
                    entityType: MailAuditLogAction.ENTITY_TYPE_EMAIL_CONFIG,
                    message: `Email config not found for ${metadata?.from} using default config ${metadata?.defaultHost}:${metadata?.defaultPort}`,
                });
            }

            if (action === "send.transport.error") {
                await this.createAuditLog({
                    headers,
                    action: MailAuditLogAction.SEND_FAILED,
                    actorType: MailAuditLogAction.ACTOR_TYPE_API_KEY,
                    actorId: apiKey.id,
                    entityType: MailAuditLogAction.ENTITY_TYPE_SENT_MESSAGE,
                    entityId: record?.id,
                    metadata: dto,
                    message: `SMTP not configured; message ${record.id} stored as queued only`,
                });
            }
        };
    }

    private assertSenderAllowed(apiKey: ApiKey, from: string): void {
        const allowed = (apiKey.allowedFrom as string[]) ?? [];
        if (allowed.length > 0 && !allowed.includes(from)) {
            throw new ForbiddenException(`Sender "${from}" is not allowed for this API key`);
        }
    }

    private assertAttachmentsWithinLimits(attachments: UploadedAttachment[]): void {
        if (attachments.length > ATTACHMENT_LIMITS.maxFiles) {
            throw new PayloadTooLargeException(`Too many attachments (max ${ATTACHMENT_LIMITS.maxFiles})`);
        }
        const total = attachments.reduce((sum, a) => sum + a.size, 0);
        if (total > ATTACHMENT_LIMITS.maxTotalBytes) {
            throw new PayloadTooLargeException(
                `Attachments exceed total size limit (${ATTACHMENT_LIMITS.maxTotalBytes} bytes)`
            );
        }
    }

    private async getTransporter(
        from?: string,
        fireAuditLog?: (action: FireAuditLogAction, error?: any, metadata?: any) => Promise<void>
    ): Promise<{ transporter: Transporter; senderName?: string } | null> {
        const defaultHost = this.config.get<string>("SMTP_HOST");
        if (!defaultHost || !from) return null;

        const defaultPort = Number(this.config.get<string>("SMTP_PORT") ?? 587);
        const defaultUser = this.config.get<string>("SMTP_USER");
        const defaultPassword = this.config.get<string>("SMTP_PASSWORD");
        const defaultName = this.config.get<string>("SMTP_NAME");

        // Defaults to secure cert validation; set SMTP_TLS_REJECT_UNAUTHORIZED=false
        // only as a dev workaround for an expired/self-signed cert (MITM risk).
        const rejectUnauthorized = this.config.get<string>("SMTP_TLS_REJECT_UNAUTHORIZED") !== "false";
        const emailConfig = await this.prisma.emailConfig.findUnique({ where: { username: from, isActive: true } });

        const senderName = (emailConfig?.name ?? defaultName)?.trim() || undefined;

        if (!this.transporter) {
            const port = emailConfig?.port ?? defaultPort;
            const host = emailConfig?.host ?? defaultHost;
            const user = emailConfig?.username ?? defaultUser;
            const pass = emailConfig?.password ?? defaultPassword;

            // make a audit log for the email config used while actual config not found
            if (!emailConfig) {
                await fireAuditLog?.("send.sender.username.notfound", undefined, {
                    from,
                    defaultHost,
                    defaultPort,
                    defaultUser,
                    defaultPassword,
                    rejectUnauthorized,
                });
            }

            const tls = { rejectUnauthorized, ...HelperClass.toJson(emailConfig?.tls) };

            this.transporter = createTransport({
                host,
                port,
                tls,
                secure: port === 465, // 465 = implicit SSL; 587/25 = STARTTLS
                requireTLS: port !== 465, // force STARTTLS on non-SSL ports
                auth: { user, pass },
            });
        }

        return { transporter: this.transporter, senderName };
    }

    /** Nodemailer `from` — display name is what recipients see in the inbox (e.g. "sales"). */
    private formatFromAddress(email: string, name?: string): string | { name: string; address: string } {
        if (!name) return email;
        return { name, address: email };
    }

    private buildSendSuccessAuditMessage(
        messageId: string,
        apiKey: ApiKey,
        dto: SendMailDto,
        attachments: UploadedAttachment[]
    ): string {
        const deliveredAt = new Date().toISOString();
        const totalRecipients = dto.to.length + (dto.cc?.length ?? 0) + (dto.bcc?.length ?? 0);
        const attachmentTotalBytes = attachments.reduce((sum, file) => sum + file.size, 0);
        const bodyPreview = this.truncateForAudit(dto.body, 240);
        const lines: string[] = [
            "## Email sent successfully",
            "",
            "### Envelope",
            `- **Message ID:** \`${messageId}\``,
            `- **From:** \`${dto.from}\``,
            `- **To (${dto.to.length}):** ${this.formatEmailInlineList(dto.to)}`,
        ];

        if (dto.cc?.length) {
            lines.push(`- **Cc (${dto.cc.length}):** ${this.formatEmailInlineList(dto.cc)}`);
        }
        if (dto.bcc?.length) {
            lines.push(`- **Bcc (${dto.bcc.length}):** ${this.formatEmailInlineList(dto.bcc)}`);
        }

        lines.push(
            `- **Total recipients:** ${totalRecipients}`,
            "",
            "### Content",
            `- **Subject:** ${dto.subject}`,
            `- **Body type:** \`${dto.bodyType}\``,
            `- **Body size:** ${dto.body.length.toLocaleString()} character${dto.body.length === 1 ? "" : "s"}`
        );

        if (bodyPreview) {
            lines.push("", "**Body preview:**", "```", bodyPreview, "```");
        }

        lines.push("", "### Attachments");
        if (attachments.length === 0) {
            lines.push("- None");
        } else {
            lines.push(`- **${attachments.length} file(s)** · ${this.formatBytes(attachmentTotalBytes)} total`);
            for (const file of attachments) {
                lines.push(`  - \`${file.originalname}\` — ${file.mimetype} · ${this.formatBytes(file.size)}`);
            }
        }

        lines.push(
            "",
            "### Request",
            `- **API key:** ${apiKey.name} (\`${apiKey.keyPrefix}…\`)`,
            `- **API key ID:** \`${apiKey.id}\``,
            `- **Delivered at:** ${deliveredAt}`
        );

        return lines.join("\n");
    }

    private buildSendFailedAuditMessage(
        messageId: string,
        apiKey: ApiKey,
        dto: SendMailDto,
        attachments: UploadedAttachment[],
        error: string
    ): string {
        const failedAt = new Date().toISOString();
        const totalRecipients = dto.to.length + (dto.cc?.length ?? 0) + (dto.bcc?.length ?? 0);
        const attachmentTotalBytes = attachments.reduce((sum, file) => sum + file.size, 0);
        const bodyPreview = this.truncateForAudit(dto.body, 240);
        const lines: string[] = [
            "## Email delivery failed",
            "",
            "### Failure",
            `- **Status:** \`failed\``,
            `- **Error:** ${error}`,
            `- **Failed at:** ${failedAt}`,
            "",
            "### Envelope",
            `- **Message ID:** \`${messageId}\``,
            `- **From:** \`${dto.from}\``,
            `- **To (${dto.to.length}):** ${this.formatEmailInlineList(dto.to)}`,
        ];

        if (dto.cc?.length) {
            lines.push(`- **Cc (${dto.cc.length}):** ${this.formatEmailInlineList(dto.cc)}`);
        }
        if (dto.bcc?.length) {
            lines.push(`- **Bcc (${dto.bcc.length}):** ${this.formatEmailInlineList(dto.bcc)}`);
        }

        lines.push(
            `- **Total recipients:** ${totalRecipients}`,
            "",
            "### Content",
            `- **Subject:** ${dto.subject}`,
            `- **Body type:** \`${dto.bodyType}\``,
            `- **Body size:** ${dto.body.length.toLocaleString()} character${dto.body.length === 1 ? "" : "s"}`
        );

        if (bodyPreview) {
            lines.push("", "**Body preview:**", "```", bodyPreview, "```");
        }

        lines.push("", "### Attachments");
        if (attachments.length === 0) {
            lines.push("- None");
        } else {
            lines.push(`- **${attachments.length} file(s)** · ${this.formatBytes(attachmentTotalBytes)} total`);
            for (const file of attachments) {
                lines.push(`  - \`${file.originalname}\` — ${file.mimetype} · ${this.formatBytes(file.size)}`);
            }
        }

        lines.push(
            "",
            "### Request",
            `- **API key:** ${apiKey.name} (\`${apiKey.keyPrefix}…\`)`,
            `- **API key ID:** \`${apiKey.id}\``,
            `- **Recorded in database:** yes (status updated to \`failed\`)`
        );

        return lines.join("\n");
    }

    private formatEmailInlineList(emails: string[]): string {
        return emails.map((email) => `\`${email}\``).join(", ");
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    private truncateForAudit(text: string, maxLength: number): string {
        const normalized = text.replace(/\r\n/g, "\n").trim();
        if (!normalized) return "";
        const slice = normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}…`;
        return slice.replace(/```/g, "'''");
    }

    private async toView(
        id: string,
        dto: SendMailDto,
        status: SentMessageView["status"],
        error: string | null
    ): Promise<SentMessageView> {
        return {
            id,
            from: dto.from,
            to: dto.to,
            subject: dto.subject,
            status,
            error,
            createdAt: new Date().toISOString(),
        };
    }

    private async createAuditLog({
        headers,
        action,
        actorType,
        actorId,
        entityType,
        entityId,
        metadata,
        message,
    }: {
        action: MailAuditLogAction.SEND_SUCCESS | MailAuditLogAction.SEND_FAILED;
        actorType: MailAuditLogAction.ACTOR_TYPE_API_KEY | MailAuditLogAction.ACTOR_TYPE_SYSTEM;
        actorId?: string;
        entityType?:
            | MailAuditLogAction.ENTITY_TYPE_SENT_MESSAGE
            | MailAuditLogAction.ENTITY_TYPE_AUDIT_LOG
            | MailAuditLogAction.ENTITY_TYPE_EMAIL_CONFIG;
        entityId?: string;
        metadata?: any;
        headers?: any;
        message: string;
    }): Promise<AuditLog> {
        const ip = headers?.["x-forwarded-for"] ?? headers?.["cf-connecting-ip"] ?? "unknown";
        const userAgent = headers?.["user-agent"] ?? "unknown";

        return this.prisma.auditLog.create({
            data: {
                action,
                actorType,
                actorId,
                entityType,
                entityId,
                ip,
                userAgent,
                message,
                metadata: this.toJson(metadata),
            },
        });
    }

    toJson(data: any) {
        if (!data) return null;
        if (typeof data === "object") return JSON.parse(JSON.stringify(data));
        return { data };
    }
}
