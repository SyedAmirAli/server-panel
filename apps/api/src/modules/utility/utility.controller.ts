import { applyDecorators, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { UtilityService } from "./utility.service";
import HelperClass from "@/common/HelperClass";

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
    @HelperClass.paginatedQueryDocs({ orderByExample: "receivedAt" })
    @ApiOperation({
        summary: "List synced inbox messages (paginated)",
        description: "Searchable by from, to, subject, receivedAt, and isRead. Filter by receivedAt date range.",
    })
    getMailMessages(@Query() params: BasicQueryParams) {
        return this.utilityService.getMailMessages(params);
    }
}
