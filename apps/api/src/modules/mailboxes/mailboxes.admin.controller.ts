import { Body, Controller, Delete, Get, Headers as NestHeaders, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import HelperClass from "@/common/HelperClass";
import { MailboxesService, MailboxAuditAction } from "@/modules/mailboxes/mailboxes.service";
import { MailSyncService } from "@/modules/mailboxes/mail-sync.service";
import { CreateMailboxDto } from "@/modules/mailboxes/dto/create-mailbox.dto";
import { UpdateMailboxDto } from "@/modules/mailboxes/dto/update-mailbox.dto";

@ApiTags("Mailboxes — Admin")
@ApiBearerAuth("admin")
@Controller("admin/mailboxes")
@UseGuards(AdminGuard)
export class MailboxesAdminController {
    constructor(
        private readonly mailboxes: MailboxesService,
        private readonly sync: MailSyncService
    ) {}

    @Get()
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({ summary: "List mailboxes (paginated)" })
    list(@Query() params: BasicQueryParams) {
        return this.mailboxes.getMailboxes(params);
    }

    @Get(":id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Get a mailbox's details" })
    getOne(@Param("id") id: string) {
        return this.mailboxes.getOne(id);
    }

    @Post()
    @ApiOperation({ summary: "Register a mailbox (IMAP + SMTP credentials, encrypted at rest)" })
    async create(@Body() dto: CreateMailboxDto, @NestHeaders() headers: any) {
        const mailbox = await this.mailboxes.create(dto);
        await this.mailboxes.recordAudit({
            action: MailboxAuditAction.CREATE,
            entityId: mailbox.id,
            metadata: { address: mailbox.address },
            headers,
        });
        return ApiResponse.success(mailbox, "Mailbox created successfully");
    }

    @Put(":id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Update a mailbox" })
    async update(@Param("id") id: string, @Body() dto: UpdateMailboxDto, @NestHeaders() headers: any) {
        const mailbox = await this.mailboxes.update(id, dto);
        await this.mailboxes.recordAudit({
            action: MailboxAuditAction.UPDATE,
            entityId: id,
            headers,
        });
        return ApiResponse.success(mailbox, "Mailbox updated successfully");
    }

    @Delete(":id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Delete a mailbox (cascades its synced messages)" })
    async remove(@Param("id") id: string, @NestHeaders() headers: any) {
        const mailbox = await this.mailboxes.remove(id);
        await this.mailboxes.recordAudit({
            action: MailboxAuditAction.DELETE,
            entityId: id,
            metadata: { address: mailbox.address },
            headers,
        });
        return ApiResponse.success(mailbox, "Mailbox deleted successfully");
    }

    @Post("test")
    @ApiOperation({ summary: "Test IMAP + SMTP connectivity for in-progress (unsaved) form values" })
    async testDraft(@Body() dto: CreateMailboxDto, @NestHeaders() headers: any) {
        const result = await this.mailboxes.testConnection(dto);
        await this.mailboxes.recordAudit({
            action: MailboxAuditAction.TEST_CONNECTION,
            metadata: { address: dto.address, imapOk: result.imap.ok, smtpOk: result.smtp.ok },
            headers,
        });
        return ApiResponse.success(result, result.imap.ok && result.smtp.ok ? "Connection successful" : "Connection test failed");
    }

    @Post(":id/test")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Test IMAP + SMTP connectivity for a saved mailbox" })
    async testSaved(@Param("id") id: string, @NestHeaders() headers: any) {
        const result = await this.mailboxes.testConnection({ id });
        await this.mailboxes.recordAudit({
            action: MailboxAuditAction.TEST_CONNECTION,
            entityId: id,
            metadata: { imapOk: result.imap.ok, smtpOk: result.smtp.ok },
            headers,
        });
        return ApiResponse.success(result, result.imap.ok && result.smtp.ok ? "Connection successful" : "Connection test failed");
    }

    @Post(":id/sync")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Trigger an immediate IMAP sync for one mailbox (same routine the scheduler runs)" })
    async syncNow(@Param("id") id: string) {
        const mailbox = await this.mailboxes.assertExists(id);
        const result = await this.sync.syncMailbox(mailbox);
        return ApiResponse.success(result, `Synced — ${result.imported} new message(s)`);
    }

    @Post("sync-all")
    @ApiOperation({ summary: "Trigger an immediate IMAP sync for every active mailbox (same routine the scheduler runs)" })
    async syncAll() {
        const result = await this.sync.syncAllActive();
        return ApiResponse.success(
            result,
            `Synced ${result.mailboxes} mailbox(es) — ${result.imported} new message(s)`
        );
    }
}
