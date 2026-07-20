import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    type ObjectCannedACL,
    type _Object,
    type CommonPrefix,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Bucket } from "@prisma/client";
import type { Readable } from "node:stream";
import { decryptSecret } from "@/common/crypto";

export interface HeadResult {
    size: number;
    contentType?: string;
    etag?: string;
    lastModified?: Date;
}

interface CachedClient {
    client: S3Client;
    /** Fingerprint of the bucket config used to build the client (rebuild on change). */
    signature: string;
}

/**
 * Central S3 gateway. Builds one cached {@link S3Client} per bucket from its
 * decrypted credentials and exposes the object operations the module needs.
 * Every call surfaces the real SDK error message (feature: careful failures).
 */
@Injectable()
export class S3ClientService {
    private readonly logger = new Logger(S3ClientService.name);
    private readonly cache = new Map<string, CachedClient>();

    constructor(private readonly config: ConfigService) {}

    private get encryptionKey(): string {
        return this.config.get<string>("ENCRYPTION_KEY") ?? "";
    }

    /** Decrypt a bucket's stored credentials. */
    decryptCreds(bucket: Bucket): { accessKeyId: string; secretAccessKey: string } {
        return {
            accessKeyId: decryptSecret(bucket.accessKeyEnc, this.encryptionKey),
            secretAccessKey: decryptSecret(bucket.secretKeyEnc, this.encryptionKey),
        };
    }

    private signatureOf(bucket: Bucket): string {
        return [bucket.endpoint, bucket.region, bucket.forcePathStyle, bucket.updatedAt?.toISOString()].join("|");
    }

    private clientFor(bucket: Bucket): S3Client {
        const signature = this.signatureOf(bucket);
        const cached = this.cache.get(bucket.id);
        if (cached && cached.signature === signature) return cached.client;

        const { accessKeyId, secretAccessKey } = this.decryptCreds(bucket);
        const client = new S3Client({
            region: bucket.region ?? "auto",
            endpoint: bucket.endpoint ?? undefined,
            forcePathStyle: bucket.forcePathStyle,
            credentials: { accessKeyId, secretAccessKey },
        });
        this.cache.set(bucket.id, { client, signature });
        return client;
    }

    /** Drop a cached client (e.g. after credential rotation or bucket delete). */
    invalidate(bucketId: string): void {
        this.cache.get(bucketId)?.client.destroy();
        this.cache.delete(bucketId);
    }

    /** Normalize any SDK/network error into a BadGateway with the provider's real message. */
    private fail(op: string, err: unknown): never {
        const e = err as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
        const code = e?.Code ?? e?.name ?? "S3Error";
        const status = e?.$metadata?.httpStatusCode;
        const message = e?.message ?? "Unknown storage provider error";
        this.logger.warn(`S3 ${op} failed [${code}${status ? ` ${status}` : ""}]: ${message}`);
        throw new BadGatewayException(`Storage provider error during ${op}: ${code} — ${message}`);
    }

    async testConnection(bucket: Bucket): Promise<void> {
        try {
            await this.clientFor(bucket).send(new HeadBucketCommand({ Bucket: bucket.bucketName }));
        } catch (err) {
            this.fail("connect", err);
        }
    }

    async listObjects(
        bucket: Bucket,
        opts: { prefix?: string; delimiter?: string; continuationToken?: string; maxKeys?: number } = {}
    ): Promise<{ objects: _Object[]; prefixes: CommonPrefix[]; nextToken: string | null }> {
        try {
            const res = await this.clientFor(bucket).send(
                new ListObjectsV2Command({
                    Bucket: bucket.bucketName,
                    Prefix: opts.prefix || undefined,
                    Delimiter: opts.delimiter,
                    ContinuationToken: opts.continuationToken,
                    MaxKeys: opts.maxKeys,
                })
            );
            return {
                objects: res.Contents ?? [],
                prefixes: res.CommonPrefixes ?? [],
                nextToken: res.IsTruncated ? res.NextContinuationToken ?? null : null,
            };
        } catch (err) {
            this.fail("list", err);
        }
    }

    async headObject(bucket: Bucket, key: string): Promise<HeadResult | null> {
        try {
            const res = await this.clientFor(bucket).send(
                new HeadObjectCommand({ Bucket: bucket.bucketName, Key: key })
            );
            return {
                size: res.ContentLength ?? 0,
                contentType: res.ContentType,
                etag: res.ETag,
                lastModified: res.LastModified,
            };
        } catch (err) {
            const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
            if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return null;
            this.fail("head", err);
        }
    }

    /** True if the object exists (used by the unique-filename resolver). */
    async objectExists(bucket: Bucket, key: string): Promise<boolean> {
        return (await this.headObject(bucket, key)) !== null;
    }

    async putObject(
        bucket: Bucket,
        key: string,
        body: Buffer,
        contentType: string,
        acl?: ObjectCannedACL
    ): Promise<{ etag?: string }> {
        try {
            const res = await this.clientFor(bucket).send(
                new PutObjectCommand({
                    Bucket: bucket.bucketName,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                    // Omit ACL entirely when not provided: buckets with Object Ownership
                    // "bucket owner enforced" (ACLs disabled) reject any ACL, even "private".
                    ...(acl ? { ACL: acl } : {}),
                })
            );
            return { etag: res.ETag };
        } catch (err) {
            this.fail("upload", err);
        }
    }

    /** True if an error is S3's "ACLs are disabled on this bucket" rejection. */
    static isAclUnsupported(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /AccessControlListNotSupported|does not allow ACLs/i.test(msg);
    }

    async getObjectStream(bucket: Bucket, key: string): Promise<Readable> {
        try {
            const res = await this.clientFor(bucket).send(
                new GetObjectCommand({ Bucket: bucket.bucketName, Key: key })
            );
            return res.Body as Readable;
        } catch (err) {
            this.fail("download", err);
        }
    }

    async deleteObject(bucket: Bucket, key: string): Promise<void> {
        try {
            await this.clientFor(bucket).send(new DeleteObjectCommand({ Bucket: bucket.bucketName, Key: key }));
        } catch (err) {
            this.fail("delete", err);
        }
    }

    /** Bulk delete (chunked to the S3 limit of 1000 keys per request). */
    async deleteObjects(bucket: Bucket, keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        try {
            const client = this.clientFor(bucket);
            for (let i = 0; i < keys.length; i += 1000) {
                const chunk = keys.slice(i, i + 1000);
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket.bucketName,
                        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
                    })
                );
            }
        } catch (err) {
            this.fail("bulk-delete", err);
        }
    }

    async copyObject(bucket: Bucket, sourceKey: string, destKey: string): Promise<void> {
        try {
            await this.clientFor(bucket).send(
                new CopyObjectCommand({
                    Bucket: bucket.bucketName,
                    CopySource: `${bucket.bucketName}/${encodeURIComponent(sourceKey)}`,
                    Key: destKey,
                })
            );
        } catch (err) {
            this.fail("copy", err);
        }
    }

    async presignGetUrl(bucket: Bucket, key: string, expiresIn: number): Promise<string> {
        try {
            return await getSignedUrl(
                this.clientFor(bucket),
                new GetObjectCommand({ Bucket: bucket.bucketName, Key: key }),
                { expiresIn }
            );
        } catch (err) {
            this.fail("presign", err);
        }
    }

    /** Fully enumerate a bucket/prefix and sum object count + bytes. */
    async computeStats(
        bucket: Bucket,
        prefix?: string,
        maxObjects = 1_000_000
    ): Promise<{ objectCount: number; totalSize: number; truncated: boolean }> {
        let objectCount = 0;
        let totalSize = 0;
        let token: string | undefined;
        let truncated = false;
        do {
            const res = await this.listObjects(bucket, { prefix, continuationToken: token, maxKeys: 1000 });
            for (const o of res.objects) {
                objectCount++;
                totalSize += o.Size ?? 0;
            }
            token = res.nextToken ?? undefined;
            if (objectCount >= maxObjects) {
                truncated = true;
                break;
            }
        } while (token);
        return { objectCount, totalSize, truncated };
    }
}
