import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
import { ImapFlow } from "imapflow";
import type { Mailbox } from "@prisma/client";
import type { MailboxConnectionTestResult, MailboxView } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import { encryptSecret, decryptSecret } from "@/common/crypto";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { CreateMailboxDto } from "@/modules/mailboxes/dto/create-mailbox.dto";
import { UpdateMailboxDto } from "@/modules/mailboxes/dto/update-mailbox.dto";

export enum MailboxAuditAction {
    CREATE = "mailbox.create",
    UPDATE = "mailbox.update",
    DELETE = "mailbox.delete",
    TEST_CONNECTION = "mailbox.test",
    SYNC_SUCCESS = "mailbox.sync.success",
    SYNC_FAILED = "mailbox.sync.failed",
}

interface ConnectionCheckOpts {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
}

@Injectable()
export class MailboxesService {
    private readonly logger = new Logger(MailboxesService.name);

    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    async create(dto: CreateMailboxDto): Promise<MailboxView> {
        const mailbox = await this.prisma.mailbox.create({
            data: {
                address: dto.address,
                displayName: dto.displayName ?? null,
                imapHost: dto.imapHost,
                imapPort: dto.imapPort,
                imapSecure: dto.imapSecure,
                imapUser: dto.imapUser,
                imapPassword: encryptSecret(dto.imapPassword, this.encryptionKey),
                smtpHost: dto.smtpHost,
                smtpPort: dto.smtpPort,
                smtpSecure: dto.smtpSecure,
                smtpUser: dto.smtpUser,
                smtpPassword: encryptSecret(dto.smtpPassword, this.encryptionKey),
                isActive: dto.isActive ?? true,
            },
        });
        return this.toView(mailbox);
    }

    async getMailboxes(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        return PrismaQueryBuilder.create<Mailbox>(this.prisma, "mailbox")
            .select(select)
            .search(search, ["address", "displayName", "imapHost", "smtpHost"])
            .orderBy(orderBy, order)
            .paginate({ page, limit, baseUrl, pageName })
            .then((result) => ({ ...result, data: result.data.map((row) => this.toView(row as Mailbox)) }));
    }

    async getOne(id: string): Promise<MailboxView> {
        return this.toView(await this.assertExists(id));
    }

    async update(id: string, dto: UpdateMailboxDto): Promise<MailboxView> {
        await this.assertExists(id);
        const data: Record<string, unknown> = {};
        if (dto.address !== undefined) data.address = dto.address;
        if (dto.displayName !== undefined) data.displayName = dto.displayName || null;
        if (dto.imapHost !== undefined) data.imapHost = dto.imapHost;
        if (dto.imapPort !== undefined) data.imapPort = dto.imapPort;
        if (dto.imapSecure !== undefined) data.imapSecure = dto.imapSecure;
        if (dto.imapUser !== undefined) data.imapUser = dto.imapUser;
        if (dto.imapPassword) data.imapPassword = encryptSecret(dto.imapPassword, this.encryptionKey);
        if (dto.smtpHost !== undefined) data.smtpHost = dto.smtpHost;
        if (dto.smtpPort !== undefined) data.smtpPort = dto.smtpPort;
        if (dto.smtpSecure !== undefined) data.smtpSecure = dto.smtpSecure;
        if (dto.smtpUser !== undefined) data.smtpUser = dto.smtpUser;
        if (dto.smtpPassword) data.smtpPassword = encryptSecret(dto.smtpPassword, this.encryptionKey);
        if (dto.isActive !== undefined) data.isActive = dto.isActive;

        if (Object.keys(data).length === 0) throw new BadRequestException("No fields to update");
        const mailbox = await this.prisma.mailbox.update({ where: { id }, data });
        return this.toView(mailbox);
    }

    async remove(id: string): Promise<MailboxView> {
        const mailbox = await this.assertExists(id);
        await this.prisma.mailbox.delete({ where: { id } });
        return this.toView(mailbox);
    }

    /** Test IMAP + SMTP connectivity — against a saved mailbox (by id) or in-progress create-form values. */
    async testConnection(source: { id: string } | CreateMailboxDto): Promise<MailboxConnectionTestResult> {
        const mailbox = "id" in source ? await this.assertExists(source.id) : null;

        const imapPassword = mailbox ? this.decryptOrNull(mailbox.imapPassword) : (source as CreateMailboxDto).imapPassword;
        const smtpPassword = mailbox ? this.decryptOrNull(mailbox.smtpPassword) : (source as CreateMailboxDto).smtpPassword;
        const values = mailbox ?? (source as CreateMailboxDto);

        if (imapPassword === null || smtpPassword === null) {
            return {
                imap: { ok: false, error: "Stored password could not be decrypted" },
                smtp: { ok: false, error: "Stored password could not be decrypted" },
            };
        }

        const [imap, smtp] = await Promise.all([
            this.testImap({
                host: values.imapHost,
                port: values.imapPort ?? 993,
                secure: values.imapSecure ?? true,
                user: values.imapUser,
                pass: imapPassword,
            }),
            this.testSmtp({
                host: values.smtpHost,
                port: values.smtpPort ?? 587,
                secure: values.smtpSecure ?? false,
                user: values.smtpUser,
                pass: smtpPassword,
            }),
        ]);
        return { imap, smtp };
    }

    private async testImap(opts: ConnectionCheckOpts): Promise<{ ok: boolean; error?: string }> {
        const client = new ImapFlow({
            host: opts.host,
            port: opts.port,
            secure: opts.secure,
            auth: { user: opts.user, pass: opts.pass },
            logger: false,
            verifyOnly: true,
        });
        // See mail-sync.service.ts: an unhandled 'error' event crashes the process.
        client.on("error", () => undefined);
        try {
            await client.connect();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "IMAP connection failed" };
        } finally {
            client.close();
        }
    }

    private async testSmtp(opts: ConnectionCheckOpts): Promise<{ ok: boolean; error?: string }> {
        const transporter = createTransport({
            host: opts.host,
            port: opts.port,
            secure: opts.port === 465 || opts.secure,
            requireTLS: opts.port !== 465,
            auth: { user: opts.user, pass: opts.pass },
        });
        try {
            await transporter.verify();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "SMTP connection failed" };
        } finally {
            transporter.close();
        }
    }

    /** Decrypt a stored secret; returns null (never throws) so callers can surface a clean error. */
    private decryptOrNull(ciphertext: string): string | null {
        try {
            return decryptSecret(ciphertext, this.encryptionKey);
        } catch (err) {
            this.logger.warn(`Failed to decrypt mailbox secret: ${err instanceof Error ? err.message : err}`);
            return null;
        }
    }

    async assertExists(id: string): Promise<Mailbox> {
        const mailbox = await this.prisma.mailbox.findUnique({ where: { id } });
        if (!mailbox) throw new NotFoundException("Mailbox not found");
        return mailbox;
    }

    /** Never includes imapPassword/smtpPassword — mailbox passwords are write-only after entry. */
    toView(m: Mailbox): MailboxView {
        return {
            id: m.id,
            address: m.address,
            displayName: m.displayName,
            imapHost: m.imapHost,
            imapPort: m.imapPort,
            imapSecure: m.imapSecure,
            imapUser: m.imapUser,
            smtpHost: m.smtpHost,
            smtpPort: m.smtpPort,
            smtpSecure: m.smtpSecure,
            smtpUser: m.smtpUser,
            isActive: m.isActive,
            lastSyncUid: m.lastSyncUid,
            lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
            lastSyncError: m.lastSyncError,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
        };
    }

    /** Writes directly to the shared audit_logs table — mirrors MailsService's inline pattern (no shared audit service exists for the mail domain). */
    async recordAudit(input: {
        action: MailboxAuditAction;
        entityId?: string;
        metadata?: unknown;
        headers?: Record<string, unknown>;
    }): Promise<void> {
        const h = input.headers ?? {};
        const ip = (h["x-forwarded-for"] ?? h["cf-connecting-ip"] ?? h["x-real-ip"] ?? "unknown") as string;
        const userAgent = (h["user-agent"] ?? "unknown") as string;
        try {
            await this.prisma.auditLog.create({
                data: {
                    action: input.action,
                    actorType: "admin",
                    entityType: "Mailbox",
                    entityId: input.entityId,
                    metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : null,
                    ip: typeof ip === "string" ? ip.split(",")[0].trim() : "unknown",
                    userAgent,
                },
            });
        } catch {
            /* auditing must never break the operation */
        }
    }
}
