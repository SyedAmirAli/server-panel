import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Bucket, StorageApiKey, StorageObject } from "@prisma/client";
import type { Readable } from "node:stream";
import sharp from "sharp";
import type {
    StorageListEntry,
    StorageListResult,
    StorageObjectView,
    UploadResult,
} from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";
import PrismaQueryBuilder, { BasicQueryParams } from "@/common/prisma-query-builder.service";
import { S3ClientService } from "@/modules/storage/s3-client.service";
import { BucketsService } from "@/modules/storage/buckets.service";
import { buildKey, candidateName, findLockingPrefix, normalizeKeyPath, normalizePrefix, slugifyFilename } from "@/modules/storage/storage-path.util";

export interface UploadFile {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

export interface UploadOptions {
    prefix?: string;
    /** Exact object key for a raw/folder upload (verbatim, overwrites). Overrides prefix. */
    keyPath?: string;
    private?: string | boolean;
    expiresIn?: number;
    convertToWebp?: boolean;
    compress?: boolean;
    quality?: number;
}

/** Coerce a boolean that may arrive as a multipart string ("true"/"false"). */
function coerceBool(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

const EXT_CONTENT_TYPES: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".yml": "application/yaml",
    ".yaml": "application/yaml",
};

function contentTypeForName(name: string): string {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return "application/octet-stream";
    return EXT_CONTENT_TYPES[name.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

export interface UploadActor {
    type: "admin" | "apikey";
    id?: string;
}

const DEFAULT_PRESIGN_TTL = 3600;
const MAX_UNIQUE_ATTEMPTS = 1000;

@Injectable()
export class ObjectsService {
    private readonly logger = new Logger(ObjectsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly s3: S3ClientService,
        private readonly buckets: BucketsService
    ) {}

    private get defaultPresignTtl(): number {
        return Number(this.config.get<string>("STORAGE_PRESIGN_DEFAULT_TTL")) || DEFAULT_PRESIGN_TTL;
    }

    /**
     * Resolve the target bucket for a key-scoped request:
     * requested publicId → key's default → error; then enforce the key's bucket allowlist.
     */
    async resolveBucketForKey(key: StorageApiKey, requestedPublicId?: string): Promise<Bucket> {
        const publicId = requestedPublicId || key.defaultBucketId;
        if (!publicId) {
            throw new BadRequestException("No bucketId provided and this key has no default bucket configured");
        }
        const allowed = (key.allowedBuckets as string[]) ?? [];
        if (allowed.length > 0 && !allowed.includes(publicId)) {
            throw new ForbiddenException(`This key is not allowed to access bucket ${publicId}`);
        }
        return this.buckets.getActiveEntity(publicId);
    }

    /** Apply WebP conversion / compression to image buffers (non-images pass through untouched). */
    private async processImage(
        file: UploadFile,
        opts: UploadOptions
    ): Promise<{ buffer: Buffer; contentType: string; ext: string | null; converted: boolean; compressed: boolean }> {
        const isImage = file.mimetype.startsWith("image/") && file.mimetype !== "image/svg+xml";
        if (!isImage || (!opts.convertToWebp && !opts.compress)) {
            return { buffer: file.buffer, contentType: file.mimetype, ext: null, converted: false, compressed: false };
        }

        const quality = opts.quality ?? 80;
        try {
            const pipeline = sharp(file.buffer, { failOn: "none" });
            if (opts.convertToWebp) {
                const buffer = await pipeline.webp({ quality }).toBuffer();
                return { buffer, contentType: "image/webp", ext: ".webp", converted: true, compressed: !!opts.compress };
            }
            // Compress in the original format.
            if (file.mimetype === "image/jpeg") {
                const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
                return { buffer, contentType: file.mimetype, ext: null, converted: false, compressed: true };
            }
            if (file.mimetype === "image/png") {
                const buffer = await pipeline.png({ quality, compressionLevel: 9 }).toBuffer();
                return { buffer, contentType: file.mimetype, ext: null, converted: false, compressed: true };
            }
            if (file.mimetype === "image/webp") {
                const buffer = await pipeline.webp({ quality }).toBuffer();
                return { buffer, contentType: file.mimetype, ext: null, converted: false, compressed: true };
            }
            // Other image types: re-encode as webp only if requested; otherwise leave alone.
            return { buffer: file.buffer, contentType: file.mimetype, ext: null, converted: false, compressed: false };
        } catch (err) {
            this.logger.warn(`Image processing failed, uploading original: ${(err as Error).message}`);
            return { buffer: file.buffer, contentType: file.mimetype, ext: null, converted: false, compressed: false };
        }
    }

    /** Find a free object key using the increment strategy (name.ext → name-1.ext → name-2.ext …). */
    private async resolveUniqueKey(bucket: Bucket, prefix: string, base: string, ext: string): Promise<string> {
        for (let n = 0; n < MAX_UNIQUE_ATTEMPTS; n++) {
            const key = buildKey(prefix, candidateName(base, ext, n));
            if (!(await this.s3.objectExists(bucket, key))) return key;
        }
        throw new BadRequestException("Could not resolve a unique filename after many attempts");
    }

    /** The provider endpoint URL (e.g. Cloudflare account URL / AWS virtual-hosted URL). */
    private buildEndpointUrl(bucket: Bucket, key: string): string {
        const encoded = key.split("/").map(encodeURIComponent).join("/");
        if (bucket.endpoint) {
            const base = bucket.endpoint.replace(/\/+$/, "");
            return bucket.forcePathStyle ? `${base}/${bucket.bucketName}/${encoded}` : `${base}/${encoded}`;
        }
        const region = bucket.region && bucket.region !== "auto" ? `.${bucket.region}` : "";
        return `https://${bucket.bucketName}.s3${region}.amazonaws.com/${encoded}`;
    }

    /** The public-facing URL: custom/CDN domain if configured, else the endpoint URL. */
    private buildPublicUrl(bucket: Bucket, key: string): string {
        if (bucket.publicBaseUrl) {
            const encoded = key.split("/").map(encodeURIComponent).join("/");
            return `${bucket.publicBaseUrl}/${encoded}`;
        }
        return this.buildEndpointUrl(bucket, key);
    }

    async upload(bucket: Bucket, file: UploadFile, opts: UploadOptions, actor: UploadActor): Promise<UploadResult> {
        if (!file) throw new BadRequestException("No file provided");

        const raw = !!opts.keyPath;
        let key: string;
        let body: Buffer;
        let contentType: string;
        let converted = false;
        let compressed = false;

        if (raw) {
            // Raw/folder clone: store verbatim (no slugify, no processing), overwrite if present.
            key = normalizeKeyPath(opts.keyPath as string);
            if (!key) throw new BadRequestException("Invalid keyPath");
            body = file.buffer;
            contentType = file.mimetype || "application/octet-stream";
        } else {
            // 1. Image processing (may change extension/contentType).
            const processed = await this.processImage(file, opts);
            // 2. Slugify + build key (webp conversion overrides the extension).
            const prefix = normalizePrefix(opts.prefix);
            const { base, ext: originalExt } = slugifyFilename(file.originalname);
            const ext = processed.ext ?? originalExt;
            // 3. Unique-name resolution against the live bucket.
            key = await this.resolveUniqueKey(bucket, prefix, base, ext);
            body = processed.buffer;
            contentType = processed.contentType;
            converted = processed.converted;
            compressed = processed.compressed;
        }

        const objectPrefix = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : null;

        // 4. Upload. Private objects need no ACL (default is private). Public objects
        //    try public-read, but fall back to no ACL if the bucket disables ACLs
        //    (Object Ownership "bucket owner enforced" — public access via bucket policy).
        const isPrivate = coerceBool(opts.private, true);
        let put: { etag?: string };
        if (isPrivate) {
            put = await this.s3.putObject(bucket, key, body, contentType);
        } else {
            try {
                put = await this.s3.putObject(bucket, key, body, contentType, "public-read");
            } catch (err) {
                if (!S3ClientService.isAclUnsupported(err)) throw err;
                this.logger.warn(`Bucket ${bucket.publicId} disallows ACLs; uploading without one (use a bucket policy for public access)`);
                put = await this.s3.putObject(bucket, key, body, contentType);
            }
        }

        // 5. Persist DB record (upsert so a raw overwrite updates the existing row).
        const record = await this.prisma.storageObject.upsert({
            where: { bucketId_key: { bucketId: bucket.id, key } },
            create: {
                bucketId: bucket.id,
                key,
                prefix: objectPrefix,
                originalName: file.originalname.slice(0, 512),
                size: body.length,
                contentType,
                etag: put.etag ?? null,
                isPrivate,
                convertedWebp: converted,
                compressed,
                quality: !raw && (opts.convertToWebp || opts.compress) ? opts.quality ?? 80 : null,
                uploadedByType: actor.type,
                uploadedById: actor.id ?? null,
                metadata: { mimetype: file.mimetype, originalSize: file.size },
            },
            update: {
                size: body.length,
                contentType,
                etag: put.etag ?? null,
                isPrivate,
                convertedWebp: converted,
                compressed,
            },
        });

        // 6. Build return URL (presigned for private, direct for public).
        const expiresIn = opts.expiresIn ?? this.defaultPresignTtl;
        const url = isPrivate
            ? await this.s3.presignGetUrl(bucket, key, expiresIn)
            : this.buildPublicUrl(bucket, key);

        return {
            key,
            bucketId: bucket.publicId,
            url,
            // Also expose the provider/default endpoint URL for public objects (shown
            // alongside the CDN/custom-domain URL). Note: for R2/MinIO this is the S3 API
            // endpoint, which needs a signed request to open — it's for reference.
            endpointUrl: isPrivate ? null : this.buildEndpointUrl(bucket, key),
            presigned: isPrivate,
            expiresIn: isPrivate ? expiresIn : null,
            object: this.toView(record),
        };
    }

    /**
     * Create an empty (zero-byte) file at an exact name — no slugify, no uniqueness
     * resolution. The name is used verbatim (spaces/special characters allowed); callers who
     * want a clean slug can generate one client-side before submitting, but it's never forced.
     */
    async createFile(bucket: Bucket, opts: { prefix?: string; name: string; content?: string }, actor: UploadActor): Promise<UploadResult> {
        const name = opts.name.trim();
        if (!name) throw new BadRequestException("File name is required");

        const key = normalizeKeyPath(opts.prefix ? `${opts.prefix}/${name}` : name);
        if (!key) throw new BadRequestException("Invalid file name");

        if (await this.s3.objectExists(bucket, key)) {
            throw new BadRequestException(`"${key}" already exists`);
        }

        const contentType = contentTypeForName(name);
        const body = Buffer.from(opts.content ?? "", "utf-8");
        const put = await this.s3.putObject(bucket, key, body, contentType);

        const objectPrefix = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : null;
        const record = await this.prisma.storageObject.create({
            data: {
                bucketId: bucket.id,
                key,
                prefix: objectPrefix,
                originalName: name.slice(0, 512),
                size: body.length,
                contentType,
                etag: put.etag ?? null,
                isPrivate: true,
                uploadedByType: actor.type,
                uploadedById: actor.id ?? null,
            },
        });

        const expiresIn = this.defaultPresignTtl;
        const url = await this.s3.presignGetUrl(bucket, key, expiresIn);

        return {
            key,
            bucketId: bucket.publicId,
            url,
            endpointUrl: null,
            presigned: true,
            expiresIn,
            object: this.toView(record),
        };
    }

    /** Browse a bucket live (folders + files under a prefix). */
    async listLive(bucket: Bucket, prefix?: string, token?: string, limit = 100): Promise<StorageListResult> {
        const normalized = prefix ? `${normalizePrefix(prefix)}/` : "";
        const res = await this.s3.listObjects(bucket, {
            prefix: normalized || undefined,
            delimiter: "/",
            continuationToken: token,
            maxKeys: limit,
        });

        const folders: StorageListEntry[] = res.prefixes.map((p) => {
            const full = p.Prefix ?? "";
            const name = full.replace(/\/$/, "").split("/").pop() ?? full;
            return { type: "folder", key: full, name };
        });
        const files: StorageListEntry[] = res.objects
            .filter((o) => o.Key && o.Key !== normalized) // drop the folder placeholder itself
            .map((o) => ({
                type: "file",
                key: o.Key as string,
                name: (o.Key as string).split("/").pop() ?? (o.Key as string),
                size: o.Size ?? 0,
                lastModified: o.LastModified?.toISOString(),
                etag: o.ETag ?? undefined,
            }));

        return { prefix: normalized.replace(/\/$/, ""), entries: [...folders, ...files], nextToken: res.nextToken };
    }

    /** List only API-uploaded objects for a bucket, from the DB. */
    async listDb(bucket: Bucket, params: BasicQueryParams & { prefix?: string }) {
        const { page, limit, order, orderBy, search, baseUrl, pageName, select } =
            PrismaQueryBuilder.parseParams(params);

        const builder = PrismaQueryBuilder.create<StorageObject>(this.prisma, "storageObject")
            .select(select)
            .where("bucketId", "=", bucket.id)
            .search(search, ["key", "originalName", "prefix"])
            .orderBy(orderBy, order);

        if (params.prefix) builder.where("prefix", "=", normalizePrefix(params.prefix));

        return builder
            .paginate({ page, limit, baseUrl, pageName })
            .then((result) => ({ ...result, data: result.data.map((row) => this.toView(row as StorageObject)) }));
    }

    async deleteObjects(bucket: Bucket, keys: string[]): Promise<{ deleted: number }> {
        const lockedPrefixes = (bucket.lockedPrefixes as string[]) ?? [];
        if (lockedPrefixes.length > 0) {
            for (const key of keys) {
                const locking = findLockingPrefix(key, lockedPrefixes);
                if (locking) {
                    throw new ForbiddenException(`"${key}" is under locked folder "${locking}" — unlock it first`);
                }
            }
        }
        await this.s3.deleteObjects(bucket, keys);
        await this.prisma.storageObject.deleteMany({ where: { bucketId: bucket.id, key: { in: keys } } });
        return { deleted: keys.length };
    }

    async copyObject(
        bucket: Bucket,
        sourceKey: string,
        opts: { destPrefix?: string; newName?: string; convertToWebp?: boolean; quality?: number } = {}
    ): Promise<{ key: string }> {
        const slashIdx = sourceKey.lastIndexOf("/");
        const sourceDir = slashIdx >= 0 ? sourceKey.slice(0, slashIdx) : "";
        const sourceFilename = slashIdx >= 0 ? sourceKey.slice(slashIdx + 1) : sourceKey;
        const dot = sourceFilename.lastIndexOf(".");
        const sourceBase = dot > 0 ? sourceFilename.slice(0, dot) : sourceFilename;
        const sourceExt = dot > 0 ? sourceFilename.slice(dot) : "";

        const destPrefix = opts.destPrefix !== undefined ? normalizePrefix(opts.destPrefix) : sourceDir;
        const baseName = opts.newName ? slugifyFilename(opts.newName).base : `${sourceBase}-copy`;

        // Only convert to WebP if the source is actually an image.
        let convert = false;
        if (opts.convertToWebp) {
            const head = await this.s3.headObject(bucket, sourceKey);
            const contentType = head?.contentType ?? "";
            convert = contentType.startsWith("image/") && contentType !== "image/svg+xml";
        }

        const ext = convert ? ".webp" : sourceExt;
        const target = await this.resolveUniqueKey(bucket, destPrefix, baseName, ext);
        const prefix = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : null;

        let contentType: string;
        let size: number;
        let etag: string | null;

        if (convert) {
            const stream = await this.s3.getObjectStream(bucket, sourceKey);
            const source = await streamToBuffer(stream);
            const webp = await sharp(source, { failOn: "none" }).webp({ quality: opts.quality ?? 80 }).toBuffer();
            const put = await this.s3.putObject(bucket, target, webp, "image/webp");
            contentType = "image/webp";
            size = webp.length;
            etag = put.etag ?? null;
        } else {
            await this.s3.copyObject(bucket, sourceKey, target);
            const head = await this.s3.headObject(bucket, target);
            contentType = head?.contentType ?? "application/octet-stream";
            size = head?.size ?? 0;
            etag = head?.etag ?? null;
        }

        // Mirror the DB record if the source was tracked (or always create one so a converted copy is discoverable).
        const src = await this.prisma.storageObject.findFirst({ where: { bucketId: bucket.id, key: sourceKey } });
        await this.prisma.storageObject.create({
            data: {
                bucketId: bucket.id,
                key: target,
                prefix,
                originalName: src?.originalName ?? sourceFilename,
                size,
                contentType,
                etag,
                isPrivate: src?.isPrivate ?? true,
                convertedWebp: convert,
                compressed: src?.compressed ?? false,
                quality: convert ? opts.quality ?? 80 : src?.quality ?? null,
                uploadedByType: src?.uploadedByType ?? "admin",
                uploadedById: src?.uploadedById ?? null,
                metadata: src?.metadata ?? undefined,
            },
        });
        return { key: target };
    }

    async presign(bucket: Bucket, key: string, expiresIn?: number): Promise<{ url: string; expiresIn: number }> {
        const ttl = expiresIn ?? this.defaultPresignTtl;
        const url = await this.s3.presignGetUrl(bucket, key, ttl);
        return { url, expiresIn: ttl };
    }

    toView(o: StorageObject): StorageObjectView {
        return {
            id: o.id,
            bucketId: o.bucketId,
            key: o.key,
            prefix: o.prefix,
            originalName: o.originalName,
            size: o.size,
            contentType: o.contentType,
            etag: o.etag,
            isPrivate: o.isPrivate,
            convertedWebp: o.convertedWebp,
            compressed: o.compressed,
            quality: o.quality,
            createdAt: o.createdAt.toISOString(),
        };
    }
}
