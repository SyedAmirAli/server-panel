import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { S3ClientService } from "@/modules/storage/s3-client.service";
import { BucketsService } from "@/modules/storage/buckets.service";
import { StorageKeysService } from "@/modules/storage/storage-keys.service";
import { ObjectsService } from "@/modules/storage/objects.service";
import { ZipService } from "@/modules/storage/zip.service";
import { StorageAuditService } from "@/modules/storage/storage-audit.service";
import { StorageApiKeyGuard } from "@/modules/storage/storage-api-key.guard";
import { AdminSseGuard } from "@/modules/storage/admin-sse.guard";
import { BucketsAdminController } from "@/modules/storage/buckets.admin.controller";
import { StorageKeysAdminController } from "@/modules/storage/storage-keys.admin.controller";
import { StoragePublicController } from "@/modules/storage/storage.public.controller";

@Module({
    imports: [AuthModule], // AdminGuard + JwtService (AdminSseGuard) for admin routes
    controllers: [BucketsAdminController, StorageKeysAdminController, StoragePublicController],
    providers: [
        S3ClientService,
        BucketsService,
        StorageKeysService,
        ObjectsService,
        ZipService,
        StorageAuditService,
        StorageApiKeyGuard,
        AdminSseGuard,
    ],
    exports: [StorageKeysService, BucketsService],
})
export class StorageModule {}
