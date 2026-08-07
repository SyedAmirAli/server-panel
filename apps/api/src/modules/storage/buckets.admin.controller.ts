import {
    Body,
    Controller,
    Delete,
    Get,
    Headers as NestHeaders,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Req,
    Res,
    Sse,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    type MessageEvent,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { concat, map, of, type Observable } from "rxjs";
import type { ZipJobView } from "@appszone/shared";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import HelperClass from "@/common/HelperClass";
import { BucketsService } from "@/modules/storage/buckets.service";
import { ObjectsService, type UploadFile } from "@/modules/storage/objects.service";
import { ZipService } from "@/modules/storage/zip.service";
import { AdminSseGuard } from "@/modules/storage/admin-sse.guard";
import { StorageAuditService, StorageAuditAction } from "@/modules/storage/storage-audit.service";
import { CreateBucketDto } from "@/modules/storage/dto/create-bucket.dto";
import { UpdateBucketDto } from "@/modules/storage/dto/update-bucket.dto";
import { CopyObjectDto, CreateFileDto, CreateZipDto, DeleteObjectsDto, ListObjectsQueryDto, LockPathDto, PresignQueryDto, UnlockPathDto } from "@/modules/storage/dto/objects.dto";
import { UploadDto } from "@/modules/storage/dto/upload.dto";

@ApiTags("Storage — Admin")
@ApiBearerAuth("admin")
@Controller("admin/storage")
export class BucketsAdminController {
    constructor(
        private readonly buckets: BucketsService,
        private readonly objects: ObjectsService,
        private readonly zip: ZipService,
        private readonly audit: StorageAuditService
    ) {}

    /* ── Buckets ─────────────────────────────────────────── */

    @Get("buckets")
    @UseGuards(AdminGuard)
    @HelperClass.paginatedQueryDocs()
    @ApiOperation({ summary: "List buckets (paginated)" })
    listBuckets(@Query() params: BasicQueryParams) {
        return this.buckets.getBuckets(params);
    }

    @Post("buckets")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Register a bucket (verifies credentials)" })
    async createBucket(@Body() dto: CreateBucketDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.create(dto);
        await this.audit.record({
            action: StorageAuditAction.BUCKET_CREATE,
            actorType: "admin",
            entityType: "Bucket",
            entityId: bucket.publicId,
            message: `Bucket ${bucket.name} created`,
            headers,
        });
        return ApiResponse.success(bucket, "Bucket registered successfully");
    }

    @Put("buckets/:publicId")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Update a bucket" })
    async updateBucket(@Param("publicId") publicId: string, @Body() dto: UpdateBucketDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.update(publicId, dto);
        await this.audit.record({
            action: StorageAuditAction.BUCKET_UPDATE,
            actorType: "admin",
            entityType: "Bucket",
            entityId: publicId,
            headers,
        });
        return ApiResponse.success(bucket, "Bucket updated successfully");
    }

    @Patch("buckets/:publicId/toggle-active")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Enable or disable a bucket" })
    async toggleBucket(@Param("publicId") publicId: string, @Body() dto: ToggleActiveClassDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.toggleActive(publicId, dto);
        await this.audit.record({
            action: StorageAuditAction.BUCKET_TOGGLE,
            actorType: "admin",
            entityType: "Bucket",
            entityId: publicId,
            metadata: { isActive: bucket.isActive },
            headers,
        });
        return ApiResponse.success(bucket, bucket.isActive ? "Bucket enabled" : "Bucket disabled");
    }

    @Delete("buckets/:publicId")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Delete a bucket (removes its tracked object records)" })
    async deleteBucket(@Param("publicId") publicId: string, @NestHeaders() headers: any) {
        const bucket = await this.buckets.remove(publicId);
        await this.audit.record({
            action: StorageAuditAction.BUCKET_DELETE,
            actorType: "admin",
            entityType: "Bucket",
            entityId: publicId,
            headers,
        });
        return ApiResponse.success(bucket, "Bucket deleted successfully");
    }

    @Get("buckets/:publicId/stats")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Live bucket stats (object count + total size)" })
    getStats(@Param("publicId") publicId: string, @Query("prefix") prefix?: string) {
        return this.buckets.getStats(publicId, prefix);
    }

    /* ── Objects ─────────────────────────────────────────── */

    @Get("buckets/:publicId/objects")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Browse objects (source=live from bucket, source=db for tracked uploads)" })
    async listObjects(
        @Param("publicId") publicId: string,
        @Query() query: ListObjectsQueryDto,
        @Query() params: BasicQueryParams
    ) {
        const bucket = await this.buckets.getEntity(publicId);
        if (query.source === "db") {
            return this.objects.listDb(bucket, { ...params, prefix: query.prefix });
        }
        return this.objects.listLive(bucket, query.prefix, query.token, query.limit ?? 100);
    }

    @Post("buckets/:publicId/objects/upload")
    @UseGuards(AdminGuard)
    @UseInterceptors(FileInterceptor("file"))
    @ApiParam({ name: "publicId" })
    @ApiConsumes("multipart/form-data")
    @ApiOperation({ summary: "Upload a file to a bucket (admin)" })
    async uploadObject(
        @Param("publicId") publicId: string,
        @Body() dto: UploadDto,
        @UploadedFile() file: UploadFile,
        @NestHeaders() headers: any
    ) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        const result = await this.objects.upload(bucket, file, dto, { type: "admin" });
        await this.audit.record({
            action: StorageAuditAction.OBJECT_UPLOAD,
            actorType: "admin",
            entityType: "StorageObject",
            entityId: result.object.id,
            metadata: { key: result.key, bucketId: publicId },
            headers,
        });
        return ApiResponse.success(result, "File uploaded successfully");
    }

    @Post("buckets/:publicId/objects/create-file")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Create an empty file at an exact name (no slugify, no processing)" })
    async createFile(@Param("publicId") publicId: string, @Body() dto: CreateFileDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        const result = await this.objects.createFile(bucket, dto, { type: "admin" });
        await this.audit.record({
            action: StorageAuditAction.OBJECT_CREATE,
            actorType: "admin",
            entityType: "StorageObject",
            entityId: result.object.id,
            metadata: { key: result.key, bucketId: publicId },
            headers,
        });
        return ApiResponse.success(result, "File created successfully");
    }

    @Delete("buckets/:publicId/objects")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Delete objects (single or bulk)" })
    async deleteObjects(@Param("publicId") publicId: string, @Body() dto: DeleteObjectsDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        const result = await this.objects.deleteObjects(bucket, dto.keys);
        await this.audit.record({
            action: StorageAuditAction.OBJECT_DELETE,
            actorType: "admin",
            entityType: "StorageObject",
            entityId: publicId,
            metadata: { keys: dto.keys, count: result.deleted },
            headers,
        });
        return ApiResponse.success(result, `${result.deleted} object(s) deleted`);
    }

    @Post("buckets/:publicId/objects/copy")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Copy an object" })
    async copyObject(@Param("publicId") publicId: string, @Body() dto: CopyObjectDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        const result = await this.objects.copyObject(bucket, dto.sourceKey, {
            destPrefix: dto.destPrefix,
            newName: dto.newName,
            convertToWebp: dto.convertToWebp,
            quality: dto.quality,
        });
        await this.audit.record({
            action: StorageAuditAction.OBJECT_COPY,
            actorType: "admin",
            entityType: "StorageObject",
            entityId: publicId,
            metadata: { from: dto.sourceKey, to: result.key },
            headers,
        });
        return ApiResponse.success(result, "Object copied successfully");
    }

    @Post("buckets/:publicId/lock")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Delete-protect a folder (no confirmation required)" })
    async lockPath(@Param("publicId") publicId: string, @Body() dto: LockPathDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.lockPrefix(publicId, dto.prefix);
        await this.audit.record({
            action: StorageAuditAction.PATH_LOCK,
            actorType: "admin",
            entityType: "Bucket",
            entityId: publicId,
            metadata: { prefix: dto.prefix },
            headers,
        });
        return ApiResponse.success(bucket, `"${dto.prefix}" is now delete-protected`);
    }

    @Post("buckets/:publicId/unlock")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Remove a folder's delete-protection (requires the admin password)" })
    async unlockPath(@Param("publicId") publicId: string, @Body() dto: UnlockPathDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.unlockPrefix(publicId, dto.prefix, dto.password);
        await this.audit.record({
            action: StorageAuditAction.PATH_UNLOCK,
            actorType: "admin",
            entityType: "Bucket",
            entityId: publicId,
            metadata: { prefix: dto.prefix },
            headers,
        });
        return ApiResponse.success(bucket, `"${dto.prefix}" is no longer delete-protected`);
    }

    @Get("buckets/:publicId/objects/presign")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Get a presigned URL to preview/download an object" })
    async presign(@Param("publicId") publicId: string, @Query() query: PresignQueryDto) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        return this.objects.presign(bucket, query.key, query.expiresIn);
    }

    /* ── ZIP jobs ────────────────────────────────────────── */

    @Post("buckets/:publicId/zip")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "publicId" })
    @ApiOperation({ summary: "Start a ZIP job for a folder (prefix) or the whole bucket" })
    async createZip(@Param("publicId") publicId: string, @Body() dto: CreateZipDto, @NestHeaders() headers: any) {
        const bucket = await this.buckets.getActiveEntity(publicId);
        const job = await this.zip.createJob(bucket, dto.prefix);
        await this.audit.record({
            action: StorageAuditAction.ZIP_CREATE,
            actorType: "admin",
            entityType: "ZipJob",
            entityId: job.id,
            metadata: { bucketId: publicId, prefix: dto.prefix ?? null, totalBytes: job.totalBytes, totalFiles: job.totalFiles },
            headers,
        });
        return ApiResponse.success(job, "ZIP job started");
    }

    @Get("zip/:jobId")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "jobId" })
    @ApiOperation({ summary: "Get ZIP job status" })
    getZip(@Param("jobId") jobId: string) {
        return this.zip.getJob(jobId);
    }

    @Sse("zip/:jobId/events")
    @UseGuards(AdminSseGuard)
    @ApiParam({ name: "jobId" })
    @ApiOperation({ summary: "SSE stream of ZIP job progress (admin token via ?token=)" })
    zipEvents(@Param("jobId") jobId: string): Observable<MessageEvent> {
        const current = this.zip.getJob(jobId);
        const toEvent = map((job: ZipJobView): MessageEvent => ({ data: job }));
        if (current.status === "ready" || current.status === "error" || current.status === "cancelled") {
            return of(current).pipe(toEvent);
        }
        return concat(of(current), this.zip.progress$(jobId)).pipe(toEvent);
    }

    @Delete("zip/:jobId")
    @UseGuards(AdminGuard)
    @ApiParam({ name: "jobId" })
    @ApiOperation({ summary: "Cancel a ZIP job" })
    async cancelZip(@Param("jobId") jobId: string, @NestHeaders() headers: any) {
        const job = this.zip.cancel(jobId);
        await this.audit.record({
            action: StorageAuditAction.ZIP_CANCEL,
            actorType: "admin",
            entityType: "ZipJob",
            entityId: jobId,
            headers,
        });
        return ApiResponse.success(job, "ZIP job cancelled");
    }

    @Get("zip/:jobId/download")
    @UseGuards(AdminSseGuard)
    @ApiParam({ name: "jobId" })
    @ApiOperation({ summary: "Download a completed ZIP (admin token via ?token=)" })
    async downloadZip(@Param("jobId") jobId: string, @Req() req: any, @Res() res: Response) {
        const { path, name } = await this.zip.getReadyFile(jobId);
        await this.audit.record({
            action: StorageAuditAction.ZIP_DOWNLOAD,
            actorType: "admin",
            entityType: "ZipJob",
            entityId: jobId,
            headers: req.headers,
        });
        res.download(path, name);
    }
}
