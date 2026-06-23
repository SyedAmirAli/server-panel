import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { PrismaService } from "@/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { AuditLog, Mailbox, MailMessage, SentMessage } from "@prisma/client";

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
}
