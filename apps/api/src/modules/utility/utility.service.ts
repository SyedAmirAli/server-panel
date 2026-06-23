import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { PrismaService } from "@/prisma/prisma.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { DashboardStats } from "@appszone/shared";
import { AuditLog, Mailbox, MailMessage, SentMessage } from "@prisma/client";
import { prismaDateRangeFilter, resolveDashboardRange } from "./dashboard-range.util";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

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

    // api {GET} -> /utility/mail-messages
    async getMailMessages(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, fromDate, toDate, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params, { orderBy: "receivedAt" });

        const builder = PrismaQueryBuilder.create<MailMessage>(this.prisma, "mailMessage")
            .select(select)
            .search(search, ["from", "to", "subject", "receivedAt", "isRead"])
            .orderBy(orderBy, order);

        if (fromDate) {
            builder.where("receivedAt", ">=", fromDate);
        }
        if (toDate) {
            builder.where("receivedAt", "<=", toDate);
        }

        return await builder.paginate({ page, limit, baseUrl, pageName });
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
