import {
    Body,
    Controller,
    Delete,
    Get,
    Headers as NestHeaders,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { StorageApiKey } from "@prisma/client";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { CurrentStorageKey, StorageApiKeyGuard } from "@/modules/storage/storage-api-key.guard";
import { ObjectsService, type UploadFile } from "@/modules/storage/objects.service";
import { StorageAuditService, StorageAuditAction } from "@/modules/storage/storage-audit.service";
import { UploadDto } from "@/modules/storage/dto/upload.dto";
import { DeleteObjectsDto, ListObjectsQueryDto, PresignQueryDto } from "@/modules/storage/dto/objects.dto";

@ApiTags("Storage — Developer API")
@ApiBearerAuth("apikey")
@Controller("storage")
@UseGuards(StorageApiKeyGuard)
export class StoragePublicController {
    constructor(private readonly objects: ObjectsService, private readonly audit: StorageAuditService) {}

    @Post("upload")
    @UseInterceptors(FileInterceptor("file"))
    @ApiConsumes("multipart/form-data")
    @ApiOperation({
        summary: "Upload a file",
        description:
            "Multipart upload. Resolves the target bucket from `bucketId` or the key's default bucket. " +
            "Returns the final bucket URL (presigned for private objects) and stored metadata. " +
            "Clients track byte-level upload progress on their own request (e.g. XHR upload.onprogress).",
    })
    async upload(
        @CurrentStorageKey() key: StorageApiKey,
        @Body() dto: UploadDto,
        @UploadedFile() file: UploadFile,
        @NestHeaders() headers: any
    ) {
        const bucket = await this.objects.resolveBucketForKey(key, dto.bucketId);
        const result = await this.objects.upload(bucket, file, dto, { type: "apikey", id: key.id });
        await this.audit.record({
            action: StorageAuditAction.OBJECT_UPLOAD,
            actorType: "apikey",
            actorId: key.id,
            entityType: "StorageObject",
            entityId: result.object.id,
            metadata: { key: result.key, bucketId: bucket.publicId, private: result.presigned },
            headers,
        });
        return ApiResponse.success(result, "File uploaded successfully");
    }

    @Get("objects")
    @ApiOperation({ summary: "List files (source=db tracked uploads by default, source=live from bucket)" })
    async list(
        @CurrentStorageKey() key: StorageApiKey,
        @Query() query: ListObjectsQueryDto,
        @Query() params: BasicQueryParams
    ) {
        const bucket = await this.objects.resolveBucketForKey(key, query.bucketId);
        if (query.source === "live") {
            return this.objects.listLive(bucket, query.prefix, query.token, query.limit ?? 100);
        }
        return this.objects.listDb(bucket, { ...params, prefix: query.prefix });
    }

    @Delete("objects")
    @ApiOperation({ summary: "Delete files (single or bulk)" })
    async remove(@CurrentStorageKey() key: StorageApiKey, @Body() dto: DeleteObjectsDto, @NestHeaders() headers: any) {
        const bucket = await this.objects.resolveBucketForKey(key, dto.bucketId);
        const result = await this.objects.deleteObjects(bucket, dto.keys);
        await this.audit.record({
            action: StorageAuditAction.OBJECT_DELETE,
            actorType: "apikey",
            actorId: key.id,
            entityType: "StorageObject",
            entityId: bucket.publicId,
            metadata: { keys: dto.keys, count: result.deleted },
            headers,
        });
        return ApiResponse.success(result, `${result.deleted} object(s) deleted`);
    }

    @Get("presign")
    @ApiOperation({ summary: "Get a fresh presigned URL for a private object (no bytes proxied)" })
    async presign(@CurrentStorageKey() key: StorageApiKey, @Query() query: PresignQueryDto) {
        const bucket = await this.objects.resolveBucketForKey(key, query.bucketId);
        return this.objects.presign(bucket, query.key, query.expiresIn);
    }

    @Get("download")
    @ApiOperation({ summary: "Get a download URL for an object (presigned; the client fetches bytes directly)" })
    async download(@CurrentStorageKey() key: StorageApiKey, @Query() query: PresignQueryDto) {
        const bucket = await this.objects.resolveBucketForKey(key, query.bucketId);
        const { url, expiresIn } = await this.objects.presign(bucket, query.key, query.expiresIn);
        return { url, expiresIn, key: query.key };
    }
}
