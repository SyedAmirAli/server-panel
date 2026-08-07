import { applyDecorators, Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { UtilityService } from "./utility.service";
import HelperClass from "@/common/HelperClass";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@ApiTags("Utility")
@ApiBearerAuth("admin")
@Controller("utility")
@UseGuards(AdminGuard)
export class UtilityController {
    constructor(private readonly utilityService: UtilityService) {}

    @Get("audit-log")
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({
        summary: "List audit log entries (paginated)",
        description: "Searchable by action, actorType, entityType, entityId, and message.",
    })
    getAuditLog(@Query() params: BasicQueryParams) {
        return this.utilityService.getAuditLog(params);
    }

    @Get("sent-messages")
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({
        summary: "List sent messages (paginated)",
        description: "Searchable by from, to, subject, status, and error. Filter by createdAt date range.",
    })
    getSentMessages(@Query() params: BasicQueryParams) {
        return this.utilityService.getSentMessages(params);
    }

    @Get("mailboxes")
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({
        summary: "List mailboxes (paginated)",
        description: "Searchable by address and isActive. Filter by createdAt date range.",
    })
    getMailboxes(@Query() params: BasicQueryParams) {
        return this.utilityService.getMailboxes(params);
    }

    @Get("mail-messages")
    @ApiQuery({ name: "cursor", required: false, description: "Opaque cursor from a previous response's nextCursor" })
    @ApiQuery({ name: "limit", required: false, description: "Page size, default 50, max 200" })
    @ApiQuery({ name: "search", required: false, description: "Matches from or subject" })
    @ApiQuery({ name: "mailboxId", required: false, description: "Restrict to one mailbox's synced messages" })
    @ApiOperation({
        summary: "List synced inbox messages (cursor-paginated)",
        description:
            "Keyset pagination ordered strictly by receivedAt desc (newest first) across all mailboxes — " +
            "never grouped or prioritized by mailbox. Pass the previous response's nextCursor to fetch the next page.",
    })
    getMailMessages(
        @Query("cursor") cursor?: string,
        @Query("limit") limit?: string,
        @Query("search") search?: string,
        @Query("mailboxId") mailboxId?: string
    ) {
        return this.utilityService.getMailMessages({
            cursor,
            limit: limit ? Number(limit) : undefined,
            search,
            mailboxId,
        });
    }

    @Get("mail-messages/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Get one synced message's full body (text + HTML) and metadata" })
    getMailMessageDetail(@Param("id") id: string) {
        return this.utilityService.getMailMessageDetail(id);
    }

    @Get("dashboard")
    @ApiOperation({
        summary: "Dashboard aggregate stats",
        description:
            "Returns inventory totals (all-time), activity counts for the selected window, and live snapshots. " +
            "Use `period` + `offset` for preset navigation (today/week/month/year/all), or `fromDate` + `toDate` " +
            "for a custom range. All boundaries are UTC.",
    })
    getDashboard(@Query() query: DashboardQueryDto) {
        return this.utilityService.getDashboard(query);
    }
}
