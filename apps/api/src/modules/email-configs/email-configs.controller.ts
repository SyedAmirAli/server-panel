import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse as ApiSwaggerResponse,
    ApiTags,
} from "@nestjs/swagger";
import type { EmailConfigView } from "@appszone/shared";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { CreateEmailConfigDto } from "@/modules/email-configs/dto/create-email-config.dto";
import { UpdateEmailConfigDto } from "@/modules/email-configs/dto/update-email-config.dto";
import { EmailConfigsService } from "@/modules/email-configs/email-configs.service";
import HelperClass from "@/common/HelperClass";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";

@ApiTags("Email Configs")
@ApiBearerAuth("admin")
@Controller("admin/email-configs")
@UseGuards(AdminGuard)
export class EmailConfigsController {
    constructor(private readonly emailConfigs: EmailConfigsService) {}

    @Get()
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({ summary: "Get SMTP email configs (paginated)" })
    getEmailConfigs(@Query() params: BasicQueryParams) {
        return this.emailConfigs.getEmailConfigs(params);
    }

    @Get(":id")
    @ApiOperation({ summary: "Get a single SMTP email config" })
    @ApiParam({ name: "id", description: "Email config ID", example: "clx9abc123" })
    findOne(@Param("id") id: string) {
        return this.emailConfigs.findOne(id);
    }

    @Post()
    @ApiOperation({ summary: "Create an SMTP email config" })
    @ApiBody({ type: CreateEmailConfigDto })
    @ApiSwaggerResponse({ status: 201, description: "Email config created" })
    async create(@Body() dto: CreateEmailConfigDto) {
        const config = await this.emailConfigs.create(dto);
        return ApiResponse.success<EmailConfigView>(config, "Email config created successfully");
    }

    @Put(":id")
    @ApiOperation({ summary: "Update an SMTP email config" })
    @ApiParam({ name: "id", description: "Email config ID", example: "clx9abc123" })
    @ApiBody({ type: UpdateEmailConfigDto })
    async update(@Param("id") id: string, @Body() dto: UpdateEmailConfigDto) {
        const config = await this.emailConfigs.update(id, dto);
        return ApiResponse.success<EmailConfigView>(config, "Email config updated successfully");
    }

    @Delete(":id")
    @ApiOperation({ summary: "Delete an SMTP email config" })
    @ApiParam({ name: "id", description: "Email config ID", example: "clx9abc123" })
    async remove(@Param("id") id: string) {
        const config = await this.emailConfigs.remove(id);
        return ApiResponse.success<EmailConfigView>(config, "Email config deleted successfully");
    }

    @Patch(":id/toggle-active")
    @ApiOperation({ summary: "Toggle the active status of an SMTP email config" })
    @ApiParam({ name: "id", description: "Email config ID", example: "clx9abc123" })
    async toggleActive(@Param("id") id: string, @Body() body: ToggleActiveClassDto) {
        const config = await this.emailConfigs.toggleActive(id, body);
        return ApiResponse.success<EmailConfigView>(config, "Email config active status toggled successfully");
    }
}
