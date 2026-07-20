import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Bucket } from "@prisma/client";
import type { BucketStats, BucketView, StorageProvider } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import { encryptSecret, generateBucketPublicId } from "@/common/crypto";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { ToggleActiveClassDto } from "@/common/toggle-active-class.dto";
import HelperClass from "@/common/HelperClass";
import { S3ClientService } from "@/modules/storage/s3-client.service";
import { CreateBucketDto } from "@/modules/storage/dto/create-bucket.dto";
import { UpdateBucketDto } from "@/modules/storage/dto/update-bucket.dto";

@Injectable()
export class BucketsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly s3: S3ClientService
    ) {}

    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    private async generateUniquePublicId(): Promise<string> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const publicId = generateBucketPublicId(12);
            const clash = await this.prisma.bucket.findUnique({ where: { publicId } });
            if (!clash) return publicId;
        }
        throw new BadRequestException("Could not allocate a unique bucket id, please retry");
    }

    async create(dto: CreateBucketDto): Promise<BucketView> {
        const publicId = await this.generateUniquePublicId();
        const bucket = await this.prisma.bucket.create({
            data: {
                publicId,
                name: dto.name,
                provider: dto.provider,
                endpoint: dto.endpoint ?? null,
                region: dto.region ?? null,
                bucketName: dto.bucketName,
                forcePathStyle: dto.forcePathStyle ?? true,
                accessKeyEnc: encryptSecret(dto.accessKeyId, this.encryptionKey),
                secretKeyEnc: encryptSecret(dto.secretAccessKey, this.encryptionKey),
                publicBaseUrl: dto.publicBaseUrl ? dto.publicBaseUrl.replace(/\/+$/, "") : null,
            },
        });
        // Fail fast with the provider's real error if the credentials/bucket are wrong.
        await this.s3.testConnection(bucket);
        return this.toView(bucket);
    }

    async getBuckets(params: BasicQueryParams) {
        const { page, limit, order, orderBy, search, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        return PrismaQueryBuilder.create<Bucket>(this.prisma, "bucket")
            .select(select)
            .search(search, ["name", "publicId", "bucketName"])
            .orderBy(orderBy, order)
            .paginate({ page, limit, baseUrl, pageName })
            .then((result) => ({ ...result, data: result.data.map((row) => this.toView(row as Bucket)) }));
    }

    /** Resolve a bucket entity by its 12-char publicId (throws if missing). */
    async getEntity(publicId: string): Promise<Bucket> {
        const bucket = await this.prisma.bucket.findUnique({ where: { publicId } });
        if (!bucket) throw new NotFoundException(`Bucket ${publicId} not found`);
        return bucket;
    }

    /** Resolve an active bucket entity (used by the public API). */
    async getActiveEntity(publicId: string): Promise<Bucket> {
        const bucket = await this.getEntity(publicId);
        if (!bucket.isActive) throw new BadRequestException(`Bucket ${publicId} is disabled`);
        return bucket;
    }

    async update(publicId: string, dto: UpdateBucketDto): Promise<BucketView> {
        await this.getEntity(publicId);
        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.provider !== undefined) data.provider = dto.provider;
        if (dto.endpoint !== undefined) data.endpoint = dto.endpoint || null;
        if (dto.region !== undefined) data.region = dto.region || null;
        if (dto.bucketName !== undefined) data.bucketName = dto.bucketName;
        if (dto.forcePathStyle !== undefined) data.forcePathStyle = dto.forcePathStyle;
        if (dto.publicBaseUrl !== undefined) data.publicBaseUrl = dto.publicBaseUrl ? dto.publicBaseUrl.replace(/\/+$/, "") : null;
        if (dto.accessKeyId) data.accessKeyEnc = encryptSecret(dto.accessKeyId, this.encryptionKey);
        if (dto.secretAccessKey) data.secretKeyEnc = encryptSecret(dto.secretAccessKey, this.encryptionKey);

        if (Object.keys(data).length === 0) throw new BadRequestException("No fields to update");

        const bucket = await this.prisma.bucket.update({ where: { publicId }, data });
        this.s3.invalidate(bucket.id); // rebuild client with new config/creds
        return this.toView(bucket);
    }

    async remove(publicId: string): Promise<BucketView> {
        const bucket = await this.getEntity(publicId);
        await this.prisma.bucket.delete({ where: { publicId } });
        this.s3.invalidate(bucket.id);
        return this.toView(bucket);
    }

    async toggleActive(publicId: string, dto: ToggleActiveClassDto): Promise<BucketView> {
        const bucket = await this.getEntity(publicId);
        const isActive = dto?.isActive === undefined ? !bucket.isActive : HelperClass.isTrue(dto.isActive);
        const updated = await this.prisma.bucket.update({ where: { publicId }, data: { isActive } });
        return this.toView(updated);
    }

    async getStats(publicId: string, prefix?: string): Promise<BucketStats> {
        const bucket = await this.getEntity(publicId);
        const { objectCount, totalSize, truncated } = await this.s3.computeStats(bucket, prefix);
        return { publicId, objectCount, totalSize, truncated };
    }

    toView(b: Bucket): BucketView {
        return {
            id: b.id,
            publicId: b.publicId,
            name: b.name,
            provider: b.provider as StorageProvider,
            endpoint: b.endpoint,
            region: b.region,
            bucketName: b.bucketName,
            forcePathStyle: b.forcePathStyle,
            publicBaseUrl: b.publicBaseUrl,
            isActive: b.isActive,
            createdAt: b.createdAt.toISOString(),
            updatedAt: b.updatedAt.toISOString(),
        };
    }
}
