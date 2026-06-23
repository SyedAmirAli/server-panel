import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse as ApiSwaggerResponse,
    ApiTags,
} from "@nestjs/swagger";
import type { ApiKeySecretView, ApiKeyView } from "@appszone/shared";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ApiKeysService } from "@/modules/api-keys/api-keys.service";
import { CreateApiKeyDto } from "@/modules/api-keys/dto/create-api-key.dto";
import { UpdateApiKeyDto } from "@/modules/api-keys/dto/update-api-key.dto";
import HelperClass from "@/common/HelperClass";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";

@ApiTags("API Keys")
@ApiBearerAuth("admin")
@Controller("admin/keys")
@UseGuards(AdminGuard)
export class KeysController {
    constructor(private readonly apiKeys: ApiKeysService) {}

    @Get()
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({ summary: "List API keys (paginated)" })
    getApiKeys(@Query() params: BasicQueryParams) {
        return this.apiKeys.getApiKeys(params);
    }

    @Post()
    @ApiOperation({ summary: "Create an API key" })
    @ApiBody({ type: CreateApiKeyDto })
    @ApiSwaggerResponse({ status: 201, description: "API key created" })
    async create(@Body() dto: CreateApiKeyDto) {
        const key = await this.apiKeys.create(dto);
        return ApiResponse.success(key, "API key created successfully");
    }

    @Put(":id")
    @ApiOperation({ summary: "Update API key name and/or allowed sender addresses" })
    @ApiParam({ name: "id", description: "API key ID", example: "clx9abc123" })
    @ApiBody({ type: UpdateApiKeyDto })
    async update(@Param("id") id: string, @Body() dto: UpdateApiKeyDto) {
        const key = await this.apiKeys.updateApiKey(id, dto);
        return ApiResponse.success<ApiKeyView>(key, "API key updated successfully");
    }

    @Patch(":id/toggle-active")
    @ApiOperation({
        summary: "Activate or deactivate an API key",
        description: 'Pass `{ "isActive": true|false }` to set explicitly, or omit the body to toggle.',
    })
    @ApiParam({ name: "id", description: "API key ID", example: "clx9abc123" })
    @ApiBody({ type: ToggleActiveClassDto, required: false })
    async toggleActive(@Param("id") id: string, @Body() dto: ToggleActiveClassDto) {
        const key = await this.apiKeys.toggleActiveApiKey(id, dto);
        const message = key.isActive ? "API key activated" : "API key deactivated";
        return ApiResponse.success<ApiKeyView>(key, message);
    }

    @Post(":id/refresh")
    @ApiOperation({
        summary: "Rotate an API key secret",
        description: "Generates a new secret and invalidates the old one. The new secret is returned once.",
    })
    @ApiParam({ name: "id", description: "API key ID", example: "clx9abc123" })
    async refresh(@Param("id") id: string) {
        const key = await this.apiKeys.refreshApiKey(id);
        return ApiResponse.success<ApiKeySecretView>(
            key,
            "API key rotated successfully"
        );
    }

    @Delete(":id")
    @ApiOperation({ summary: "Permanently delete an API key" })
    @ApiParam({ name: "id", description: "API key ID", example: "clx9abc123" })
    async remove(@Param("id") id: string) {
        const key = await this.apiKeys.deleteApiKey(id);
        return ApiResponse.success<ApiKeyView>(key, "API key deleted successfully");
    }
}
