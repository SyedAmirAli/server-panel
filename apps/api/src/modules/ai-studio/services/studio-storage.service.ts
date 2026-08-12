import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Bucket } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { S3ClientService } from "@/modules/storage/s3-client.service";
import { encryptSecret, generateBucketPublicId } from "@/common/crypto";

export interface StoredObject {
    bucketId: string;
    /** Parent folder prefix, stored separately from the filename on purpose. */
    folder: string;
    fileName: string;
    /** `folder/fileName` — derived, never the only thing persisted. */
    storageKey: string;
    sizeBytes: number;
    contentType: string;
}

/**
 * Owns AI Studio's slice of object storage.
 *
 * Rather than opening its own S3 client, this resolves a real `Bucket` row and
 * hands it to the existing {@link S3ClientService}. That keeps credentials
 * encrypted at rest, and makes Studio documents visible in the Buckets UI
 * alongside everything else.
 *
 * Resolution is *adopt-then-create*: if a bucket with the same bucketName and
 * endpoint already exists it is reused, so pointing the env at a bucket the user
 * already registered does not silently create a duplicate row with a second copy
 * of the credentials.
 */
@Injectable()
export class StudioStorageService implements OnModuleInit {
    private readonly logger = new Logger(StudioStorageService.name);
    private bucket: Bucket | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly s3: S3ClientService
    ) {}

    async onModuleInit() {
        try {
            await this.resolveBucket();
        } catch (err) {
            // Storage being unavailable must not stop the API booting — every
            // caller surfaces a clear message instead.
            this.logger.warn(`AI Studio storage unavailable: ${(err as Error).message}`);
        }
    }

    /** Parent folder every Studio object lives under. */
    get rootFolder(): string {
        return (this.config.get<string>("CLOUDFLARE_BUCKET_FOLDER") ?? "ai-studio").replace(/^\/+|\/+$/g, "");
    }

    isConfigured(): boolean {
        return Boolean(
            this.config.get<string>("CLOUDFLARE_ACCESS_KEY_ID") &&
                this.config.get<string>("CLOUDFLARE_SECRET_ACCESS_KEY") &&
                this.config.get<string>("CLOUDFLARE_BUCKET_NAME")
        );
    }

    async getBucket(): Promise<Bucket> {
        if (this.bucket) return this.bucket;
        const resolved = await this.resolveBucket();
        if (!resolved) {
            throw new ServiceUnavailableException(
                "AI Studio storage is not configured — set the CLOUDFLARE_* variables in .env."
            );
        }
        return resolved;
    }

    private async resolveBucket(): Promise<Bucket | null> {
        if (!this.isConfigured()) return null;

        const bucketName = this.config.get<string>("CLOUDFLARE_BUCKET_NAME")!.trim();
        const endpoint = (this.config.get<string>("CLOUDFLARE_S3_API") ?? "").trim().replace(/\/+$/, "");

        // Adopt an already-registered bucket rather than duplicating it.
        const existing = await this.prisma.bucket.findFirst({
            where: { bucketName, ...(endpoint ? { endpoint } : {}) },
            orderBy: { createdAt: "asc" },
        });

        if (existing) {
            this.bucket = existing;
            this.logger.log(`AI Studio storage → existing bucket "${existing.name}" (${existing.publicId}), folder "${this.rootFolder}/"`);
            return existing;
        }

        const encryptionKey = this.config.get<string>("ENCRYPTION_KEY") ?? "";
        const created = await this.prisma.bucket.create({
            data: {
                publicId: generateBucketPublicId(12),
                name: "AI Studio Documents",
                provider: "r2",
                endpoint: endpoint || null,
                region: "auto",
                bucketName,
                forcePathStyle: true,
                accessKeyEnc: encryptSecret(this.config.get<string>("CLOUDFLARE_ACCESS_KEY_ID")!, encryptionKey),
                secretKeyEnc: encryptSecret(this.config.get<string>("CLOUDFLARE_SECRET_ACCESS_KEY")!, encryptionKey),
                isActive: true,
            },
        });
        this.bucket = created;
        this.logger.log(`AI Studio storage → created bucket "${created.name}" (${created.publicId})`);
        return created;
    }

    /* ─── keys ───────────────────────────────────────────────── */

    /**
     * Folder for a candidate's generated documents. Nested per person and per
     * document because a flat parent folder becomes unbrowsable after fifty
     * applications.
     */
    documentFolder(profileId: string, documentId: string): string {
        return `${this.rootFolder}/candidates/${profileId}/${documentId}`;
    }

    attachmentFolder(profileId: string, infoItemId: string): string {
        return `${this.rootFolder}/candidates/${profileId}/attachments/${infoItemId}`;
    }

    /* ─── operations ─────────────────────────────────────────── */

    async put(folder: string, fileName: string, body: Buffer, contentType: string): Promise<StoredObject> {
        const bucket = await this.getBucket();
        const safeName = sanitizeFileName(fileName);
        const storageKey = `${folder}/${safeName}`;
        await this.s3.putObject(bucket, storageKey, body, contentType);
        return {
            bucketId: bucket.id,
            folder,
            fileName: safeName,
            storageKey,
            sizeBytes: body.length,
            contentType,
        };
    }

    /** Time-limited shareable link. Default one week, R2's practical maximum. */
    async presign(storageKey: string, expiresIn = 60 * 60 * 24 * 7): Promise<string> {
        const bucket = await this.getBucket();
        return this.s3.presignGetUrl(bucket, storageKey, expiresIn);
    }

    async getBuffer(storageKey: string): Promise<Buffer> {
        const bucket = await this.getBucket();
        const stream = await this.s3.getObjectStream(bucket, storageKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
    }

    async remove(storageKey: string): Promise<void> {
        const bucket = await this.getBucket();
        await this.s3.deleteObject(bucket, storageKey);
    }
}

/**
 * Keep the filename human-meaningful — an employer sees it in their inbox — but
 * strip anything that would break an object key or escape the folder.
 */
function sanitizeFileName(name: string): string {
    const cleaned = name
        .replace(/[/\\]+/g, "-")
        .replace(/[^\w.\- ]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 180);
    return cleaned || "file";
}
