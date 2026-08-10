import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { Mailbox } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { decryptSecret } from "@/common/crypto";
import { MailboxAuditAction } from "@/modules/mailboxes/mailboxes.service";

const SYNC_INTERVAL_MS = 3 * 60 * 1000;
const INBOX_FOLDER = "INBOX";
// Checkpoint lastSyncUid this often during a big backlog, so a crash partway through a
// multi-thousand-message import only costs re-processing a bounded batch, not everything.
const CHECKPOINT_EVERY = 50;
// C0 controls (0-31) and DEL (127), except tab/newline/carriage-return.
const CONTROL_CHAR_CODES_TO_STRIP = new Set<number>([...Array(32).keys(), 127].filter((c) => c !== 9 && c !== 10 && c !== 13));

/**
 * Strips NUL and other control characters that MySQL's string escaping chokes on ("unexpected
 * end of hex escape") — real-world mail sometimes carries malformed/binary bytes in the subject
 * or body. Built from character codes, not a regex literal, so no raw control bytes ever need
 * to appear in this source file.
 */
function sanitizeText(s: string): string {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        if (!CONTROL_CHAR_CODES_TO_STRIP.has(s.charCodeAt(i))) out += s[i];
    }
    return out;
}

/**
 * Scheduled IMAP sync: opens a fresh connection per active mailbox every tick, imports any
 * message with a UID higher than `lastSyncUid`, then disconnects. A fresh connection per run
 * (rather than a kept-alive one) is what gives "reconnect handling" for free — a dead/expired
 * session just fails to connect and gets retried next tick, never requiring backoff/retry
 * bookkeeping of its own.
 */
@Injectable()
export class MailSyncService {
    private readonly logger = new Logger(MailSyncService.name);
    // Guards against the scheduled tick and a manual "sync now" racing the same mailbox.
    private readonly inFlight = new Set<string>();

    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    @Interval(SYNC_INTERVAL_MS)
    async handleInterval(): Promise<void> {
        await this.syncAllActive();
    }

    async syncAllActive(): Promise<{ mailboxes: number; imported: number }> {
        const mailboxes = await this.prisma.mailbox.findMany({ where: { isActive: true } });
        let imported = 0;
        for (const mailbox of mailboxes) {
            // One mailbox's failure must never stop the others from syncing.
            const result = await this.syncMailbox(mailbox).catch((err) => {
                this.logger.error(
                    `Unexpected sync error for mailbox ${mailbox.address}: ${err instanceof Error ? err.message : err}`
                );
                return { imported: 0 };
            });
            imported += result.imported;
        }
        return { mailboxes: mailboxes.length, imported };
    }

    /** Idempotent — safe to call repeatedly (manual trigger + scheduled tick) without duplicating messages. */
    async syncMailbox(mailbox: Mailbox): Promise<{ imported: number }> {
        if (this.inFlight.has(mailbox.id)) {
            this.logger.debug(`Sync already running for ${mailbox.address}, skipping`);
            return { imported: 0 };
        }
        this.inFlight.add(mailbox.id);

        let client: ImapFlow | null = null;
        let imported = 0;
        let skipped = 0;
        try {
            const pass = decryptSecret(mailbox.imapPassword, this.encryptionKey);
            client = new ImapFlow({
                host: mailbox.imapHost,
                port: mailbox.imapPort,
                secure: mailbox.imapSecure,
                auth: { user: mailbox.imapUser, pass },
                logger: false,
            });
            // ImapFlow is an EventEmitter: an 'error' with no listener is an
            // *unhandled* error event, which takes the whole Node process down.
            // The try/catch below cannot catch it, because the socket can fail
            // asynchronously long after connect() resolved (read ETIMEDOUT while
            // fetching or idling). Swallow it here; the awaited calls still
            // reject and are handled normally.
            client.on("error", (err: unknown) => {
                this.logger.warn(
                    `IMAP socket error for ${mailbox.address}: ${err instanceof Error ? err.message : String(err)}`
                );
            });
            await client.connect();

            const lock = await client.getMailboxLock(INBOX_FOLDER);
            try {
                const startUid = (mailbox.lastSyncUid ?? 0) + 1;
                const uidNext = client.mailbox ? client.mailbox.uidNext : startUid;
                let maxUid = mailbox.lastSyncUid ?? 0;
                let sinceCheckpoint = 0;

                // Nothing new — skip the fetch entirely (a "N:*" range where N >= uidNext
                // is a known IMAP footgun that can re-return the last existing message).
                if (startUid < uidNext) {
                    for await (const message of client.fetch(
                        `${startUid}:*`,
                        { uid: true, flags: true, source: true },
                        { uid: true }
                    )) {
                        if (message.uid < startUid) continue;

                        // A single malformed message (bad encoding, unparseable content) must
                        // never abort the whole backlog — log it, skip it, keep going. Its UID
                        // still counts as "seen" below so we never get stuck retrying it forever.
                        try {
                            await this.importMessage(mailbox, message);
                            imported++;
                        } catch (err) {
                            skipped++;
                            this.logger.warn(
                                `Skipping unimportable message uid=${message.uid} for ${mailbox.address}: ${
                                    err instanceof Error ? err.message : err
                                }`
                            );
                        }

                        if (message.uid > maxUid) maxUid = message.uid;
                        sinceCheckpoint++;

                        // Persist progress periodically so a later crash (network drop, IMAP
                        // rate limit) only costs re-processing a bounded batch, not the entire
                        // backlog — this is what previously made a 10k+ message mailbox retry
                        // from scratch and get stuck at the same failure point every time.
                        if (sinceCheckpoint >= CHECKPOINT_EVERY) {
                            await this.prisma.mailbox.update({
                                where: { id: mailbox.id },
                                data: { lastSyncUid: maxUid, lastSyncAt: new Date() },
                            });
                            sinceCheckpoint = 0;
                        }
                    }
                }

                await this.prisma.mailbox.update({
                    where: { id: mailbox.id },
                    data: { lastSyncUid: maxUid, lastSyncAt: new Date(), lastSyncError: null },
                });
            } finally {
                lock.release();
            }

            if (imported > 0 || skipped > 0) {
                await this.recordAudit(MailboxAuditAction.SYNC_SUCCESS, mailbox.id, { imported, skipped });
            }
            return { imported };
        } catch (err) {
            const message = err instanceof Error ? err.message : "IMAP sync failed";
            this.logger.error(`Sync failed for mailbox ${mailbox.address}: ${message}`);
            await this.prisma.mailbox
                .update({ where: { id: mailbox.id }, data: { lastSyncError: message, lastSyncAt: new Date() } })
                .catch(() => undefined);
            await this.recordAudit(MailboxAuditAction.SYNC_FAILED, mailbox.id, { error: message });
            return { imported };
        } finally {
            this.inFlight.delete(mailbox.id);
            if (client) {
                try {
                    await client.logout();
                } catch {
                    client.close();
                }
            }
        }
    }

    private async importMessage(mailbox: Mailbox, message: FetchMessageObject): Promise<void> {
        if (!message.source) return;
        const parsed = await simpleParser(message.source);

        const messageId = parsed.messageId?.trim() || `<no-msgid-${mailbox.id}-${message.uid}@local>`;
        const from = sanitizeText(this.addressText(parsed.from) || "unknown");
        const to = this.addressList(parsed.to);
        const cc = this.addressList(parsed.cc);
        const bcc = this.addressList(parsed.bcc);
        const subject = sanitizeText(parsed.subject ?? "(no subject)");
        const text = sanitizeText(parsed.text ?? "");
        const html = typeof parsed.html === "string" ? sanitizeText(parsed.html) : null;
        const flags = message.flags ? Array.from(message.flags) : [];
        const attachments = parsed.attachments.map((a) => ({
            filename: a.filename ?? null,
            contentType: a.contentType,
            size: a.size,
        }));

        // Upsert (not create) keeps this idempotent: a re-run over the same UID range — e.g.
        // a manual "sync now" racing the next scheduled tick right after — never duplicates.
        await this.prisma.mailMessage.upsert({
            where: { mailboxId_messageId: { mailboxId: mailbox.id, messageId } },
            create: {
                mailboxId: mailbox.id,
                uid: message.uid,
                messageId,
                from,
                to,
                cc,
                bcc,
                subject,
                snippet: text.slice(0, 240),
                body: text,
                html,
                flags,
                attachments,
                receivedAt: parsed.date ?? new Date(),
                isRead: flags.includes("\\Seen"),
            },
            update: {
                uid: message.uid,
                flags,
                isRead: flags.includes("\\Seen"),
            },
        });
    }

    private addressText(addr: AddressObject | undefined): string | null {
        return addr?.text ?? null;
    }

    private addressList(addr: AddressObject | AddressObject[] | undefined): string[] {
        if (!addr) return [];
        const list = Array.isArray(addr) ? addr : [addr];
        return list.flatMap((a) => a.value.map((v) => v.address).filter((x): x is string => !!x));
    }

    private async recordAudit(action: MailboxAuditAction, entityId: string, metadata?: unknown): Promise<void> {
        try {
            await this.prisma.auditLog.create({
                data: {
                    action,
                    actorType: "system",
                    entityType: "Mailbox",
                    entityId,
                    metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
                    ip: "system",
                    userAgent: "mail-sync-worker",
                },
            });
        } catch {
            /* never let an audit-log failure break the sync */
        }
    }
}
