import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { PrismaService } from "@/prisma/prisma.service";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DashboardStats, MailMessageDetailView, MailMessageView } from "@appszone/shared";
import { AuditLog, Mailbox, Prisma, SentMessage } from "@prisma/client";
import { prismaDateRangeFilter, resolveDashboardRange } from "./dashboard-range.util";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

const MAIL_MESSAGE_LIST_SELECT = {
    id: true,
    uid: true,
    mailboxId: true,
    messageId: true,
    from: true,
    to: true,
    cc: true,
    bcc: true,
    subject: true,
    snippet: true,
    receivedAt: true,
    isRead: true,
    syncedAt: true,
} satisfies Prisma.MailMessageSelect;

type MailMessageListRow = Prisma.MailMessageGetPayload<{ select: typeof MAIL_MESSAGE_LIST_SELECT }>;

@Injectable()
export class UtilityService {
    constructor(private readonly prisma: PrismaService) {}

    // api {GET} -> /utility/audit-log
    async getAuditLog(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        // Fresh builder per request — the builder is stateful, never share one instance.
        const builder = PrismaQueryBuilder.create<AuditLog>(this.prisma, "auditLog")
            .select(select)
            .search(search, ["action", "actorType", "entityType", "entityId", "message"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("createdAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("createdAt", "<=", toDate);
        }

        return await builder.paginate({ page, limit, baseUrl, pageName });
    }

    // api {GET} -> /utility/sent-messages
    async getSentMessages(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        const builder = PrismaQueryBuilder.create<SentMessage>(this.prisma, "sentMessage")
            .select(select)
            .search(search, ["from", "to", "subject", "status", "error"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("createdAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("createdAt", "<=", toDate);
        }

        return await builder.paginate({ page, limit, baseUrl, pageName });
    }

    // api {GET} -> /utility/mailboxes
    async getMailboxes(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        const builder = PrismaQueryBuilder.create<Mailbox>(this.prisma, "mailbox")
            .select(select)
            .search(search, ["address", "isActive"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("createdAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("createdAt", "<=", toDate);
        }

        return await builder.paginate({ page, limit, baseUrl, pageName });
    }

    /**
     * api {GET} -> /utility/mail-messages
     *
     * Keyset (cursor) pagination, not offset — ordered strictly by `receivedAt desc, id desc`
     * across ALL mailboxes together, so no mailbox/config is ever favored over another; only
     * chronology decides order. `id` is a tiebreaker for messages sharing the same millisecond
     * timestamp, never a primary sort key.
     */
    async getMailMessages(opts: {
        cursor?: string;
        limit?: number;
        search?: string;
        mailboxId?: string;
    }): Promise<{ data: MailMessageView[]; nextCursor: string | null }> {
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

        const and: Prisma.MailMessageWhereInput[] = [];
        if (opts.mailboxId) and.push({ mailboxId: opts.mailboxId });
        if (opts.search) {
            and.push({ OR: [{ from: { contains: opts.search } }, { subject: { contains: opts.search } }] });
        }
        if (opts.cursor) {
            const decoded = this.decodeMailCursor(opts.cursor);
            if (decoded) {
                and.push({
                    OR: [
                        { receivedAt: { lt: decoded.receivedAt } },
                        { receivedAt: decoded.receivedAt, id: { lt: decoded.id } },
                    ],
                });
            }
        }

        const rows = await this.prisma.mailMessage.findMany({
            where: and.length ? { AND: and } : undefined,
            orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
            take: limit + 1, // fetch one extra to know whether another page exists
            // List view never needs body/html/flags/attachments — those are LongText blobs
            // that can be tens of KB per message; pulling them for every row in a list is
            // what was making this query slow. The detail endpoint fetches them separately.
            select: MAIL_MESSAGE_LIST_SELECT,
        });

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const last = page[page.length - 1];
        const nextCursor = hasMore && last ? this.encodeMailCursor(last.receivedAt, last.id) : null;

        return { data: page.map((m) => this.toMailMessageView(m)), nextCursor };
    }

    private encodeMailCursor(receivedAt: Date, id: string): string {
        return Buffer.from(`${receivedAt.toISOString()}|${id}`, "utf8").toString("base64url");
    }

    private decodeMailCursor(cursor: string): { receivedAt: Date; id: string } | null {
        try {
            const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
            const receivedAt = new Date(iso);
            if (!id || Number.isNaN(receivedAt.getTime())) return null;
            return { receivedAt, id };
        } catch {
            return null;
        }
    }

    private toMailMessageView(m: MailMessageListRow): MailMessageView {
        return {
            id: m.id,
            uid: m.uid,
            mailboxId: m.mailboxId,
            messageId: m.messageId,
            syncedAt: m.syncedAt.toISOString(),
            from: m.from,
            to: (m.to as string[]) ?? [],
            cc: (m.cc as string[]) ?? [],
            bcc: (m.bcc as string[]) ?? [],
            subject: m.subject,
            snippet: m.snippet,
            receivedAt: m.receivedAt.toISOString(),
            isRead: m.isRead,
        };
    }

    // api {GET} -> /utility/mail-messages/:id
    async getMailMessageDetail(id: string): Promise<MailMessageDetailView> {
        const m = await this.prisma.mailMessage.findUnique({ where: { id } });
        if (!m) throw new NotFoundException("Message not found");

        return {
            ...this.toMailMessageView(m),
            body: m.body,
            html: m.html,
            flags: (m.flags as string[]) ?? [],
            attachments: (m.attachments as unknown as MailMessageDetailView["attachments"]) ?? [],
        };
    }

    // api {GET} -> /utility/dashboard
    async getDashboard(query: DashboardQueryDto = {}): Promise<DashboardStats> {
        if ((query.fromDate && !query.toDate) || (!query.fromDate && query.toDate)) {
            throw new BadRequestException("Both fromDate and toDate are required for a custom range");
        }

        let range;
        try {
            range = resolveDashboardRange(query);
        } catch (err) {
            throw new BadRequestException(err instanceof Error ? err.message : "Invalid date range");
        }

        const dateFilter = prismaDateRangeFilter(range);
        const sentDateWhere = dateFilter ? { createdAt: dateFilter } : undefined;
        const mailDateWhere = dateFilter ? { receivedAt: dateFilter } : undefined;
        const auditDateWhere = dateFilter ? { createdAt: dateFilter } : undefined;

        const [
            totalApiKeys,
            activeApiKeys,
            totalMailboxes,
            activeMailboxes,
            totalEmailConfigs,
            activeEmailConfigs,
            mailMessages,
            sentMessages,
            sent,
            sentFailed,
            queued,
            auditLogs,
            inboxUnread,
            sentQueued,
        ] = await Promise.all([
            this.prisma.apiKey.count(),
            this.prisma.apiKey.count({ where: { isActive: true } }),
            this.prisma.mailbox.count(),
            this.prisma.mailbox.count({ where: { isActive: true } }),
            this.prisma.emailConfig.count(),
            this.prisma.emailConfig.count({ where: { isActive: true } }),
            this.prisma.mailMessage.count({ where: mailDateWhere }),
            this.prisma.sentMessage.count({ where: sentDateWhere }),
            this.prisma.sentMessage.count({ where: { status: "sent", ...sentDateWhere } }),
            this.prisma.sentMessage.count({ where: { status: "failed", ...sentDateWhere } }),
            this.prisma.sentMessage.count({ where: { status: "queued", ...sentDateWhere } }),
            this.prisma.auditLog.count({ where: auditDateWhere }),
            this.prisma.mailMessage.count({ where: { isRead: false } }),
            this.prisma.sentMessage.count({ where: { status: "queued" } }),
        ]);

        return {
            range: {
                period: range.period,
                offset: range.offset,
                from: range.from?.toISOString() ?? null,
                to: range.to.toISOString(),
            },
            inventory: {
                totalApiKeys,
                activeApiKeys,
                totalMailboxes,
                activeMailboxes,
                totalEmailConfigs,
                activeEmailConfigs,
            },
            activity: {
                mailMessages,
                sentMessages,
                sent,
                sentFailed,
                queued,
                auditLogs,
            },
            snapshot: {
                inboxUnread,
                sentQueued,
            },
        };
    }
}
