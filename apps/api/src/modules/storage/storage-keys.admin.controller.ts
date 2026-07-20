import { Body, Controller, Delete, Get, Headers as NestHeaders, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import HelperClass from "@/common/HelperClass";
import { StorageKeysService } from "@/modules/storage/storage-keys.service";
import { StorageAuditService, StorageAuditAction } from "@/modules/storage/storage-audit.service";
import { CreateStorageKeyDto } from "@/modules/storage/dto/create-storage-key.dto";
import { UpdateStorageKeyDto } from "@/modules/storage/dto/update-storage-key.dto";

@ApiTags("Storage — Admin Keys")
@ApiBearerAuth("admin")
@Controller("admin/storage/keys")
@UseGuards(AdminGuard)
export class StorageKeysAdminController {
    constructor(private readonly keys: StorageKeysService, private readonly audit: StorageAuditService) {}

    @Get()
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({ summary: "List storage API keys (paginated)" })
    list(@Query() params: BasicQueryParams) {
        return this.keys.getKeys(params);
    }

    @Post()
    @ApiOperation({ summary: "Create a storage API key" })
    async create(@Body() dto: CreateStorageKeyDto, @NestHeaders() headers: any) {
        const key = await this.keys.create(dto);
        await this.audit.record({
            action: StorageAuditAction.KEY_CREATE,
            actorType: "admin",
            entityType: "StorageApiKey",
            entityId: key.id,
            metadata: { name: key.name, allowedBuckets: key.allowedBuckets },
            headers,
        });
        return ApiResponse.success(key, "Storage API key created successfully");
    }

    @Put(":id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Update a storage API key" })
    async update(@Param("id") id: string, @Body() dto: UpdateStorageKeyDto, @NestHeaders() headers: any) {
        const key = await this.keys.update(id, dto);
        await this.audit.record({
            action: StorageAuditAction.KEY_UPDATE,
            actorType: "admin",
            entityType: "StorageApiKey",
            entityId: id,
            headers,
        });
        return ApiResponse.success(key, "Storage API key updated successfully");
    }

    @Patch(":id/toggle-active")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Activate or deactivate a storage API key" })
    async toggleActive(@Param("id") id: string, @Body() dto: ToggleActiveClassDto, @NestHeaders() headers: any) {
        const key = await this.keys.toggleActive(id, dto);
        await this.audit.record({
            action: StorageAuditAction.KEY_TOGGLE,
            actorType: "admin",
            entityType: "StorageApiKey",
            entityId: id,
            metadata: { isActive: key.isActive },
            headers,
        });
        return ApiResponse.success(key, key.isActive ? "Storage API key activated" : "Storage API key deactivated");
    }

    @Post(":id/refresh")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Rotate a storage API key secret" })
    async refresh(@Param("id") id: string, @NestHeaders() headers: any) {
        const key = await this.keys.refresh(id);
        await this.audit.record({
            action: StorageAuditAction.KEY_ROTATE,
            actorType: "admin",
            entityType: "StorageApiKey",
            entityId: id,
            headers,
        });
        return ApiResponse.success(key, "Storage API key rotated successfully");
    }

    @Delete(":id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Delete a storage API key" })
    async remove(@Param("id") id: string, @NestHeaders() headers: any) {
        const key = await this.keys.remove(id);
        await this.audit.record({
            action: StorageAuditAction.KEY_DELETE,
            actorType: "admin",
            entityType: "StorageApiKey",
            entityId: id,
            headers,
        });
        return ApiResponse.success(key, "Storage API key deleted successfully");
    }
}
