import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Bucket } from "@prisma/client";
import { ZipArchive, type ArchiverError } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Subject, type Observable } from "rxjs";
import type { ZipJobStatus, ZipJobView } from "@appszone/shared";
import { S3ClientService } from "@/modules/storage/s3-client.service";
import { normalizePrefix } from "@/modules/storage/storage-path.util";

interface ZipJob {
    id: string;
    bucketId: string; // internal bucket id
    bucketPublicId: string;
    prefix: string | null;
    status: ZipJobStatus;
    totalBytes: number;
    processedBytes: number;
    totalFiles: number;
    processedFiles: number;
    error: string | null;
    filePath: string;
    downloadName: string;
    cancelled: boolean;
    createdAt: Date;
    subject: Subject<ZipJobView>;
}

const JOB_TTL_MS = 60 * 60 * 1000; // finished jobs & temp files live 1h

@Injectable()
export class ZipService implements OnModuleDestroy {
    private readonly logger = new Logger(ZipService.name);
    private readonly jobs = new Map<string, ZipJob>();

    constructor(private readonly config: ConfigService, private readonly s3: S3ClientService) {}

    private get tmpDir(): string {
        return this.config.get<string>("STORAGE_ZIP_TMP_DIR") || join(tmpdir(), "appszone-zip");
    }

    private get maxBytes(): number {
        return Number(this.config.get<string>("STORAGE_ZIP_MAX_BYTES")) || 2 * 1024 * 1024 * 1024; // 2 GB
    }

    private toView(job: ZipJob): ZipJobView {
        return {
            id: job.id,
            bucketId: job.bucketPublicId,
            prefix: job.prefix,
            status: job.status,
            totalBytes: job.totalBytes,
            processedBytes: job.processedBytes,
            totalFiles: job.totalFiles,
            processedFiles: job.processedFiles,
            error: job.error,
            createdAt: job.createdAt.toISOString(),
        };
    }

    private emit(job: ZipJob): void {
        job.subject.next(this.toView(job));
    }

    getJob(id: string): ZipJobView {
        const job = this.jobs.get(id);
        if (!job) throw new NotFoundException("ZIP job not found or expired");
        return this.toView(job);
    }

    progress$(id: string): Observable<ZipJobView> {
        const job = this.jobs.get(id);
        if (!job) throw new NotFoundException("ZIP job not found or expired");
        // Late subscribers still get the current state immediately via the controller.
        return job.subject.asObservable();
    }

    /** Path to a completed archive, for the download endpoint. */
    async getReadyFile(id: string): Promise<{ path: string; name: string }> {
        const job = this.jobs.get(id);
        if (!job) throw new NotFoundException("ZIP job not found or expired");
        if (job.status !== "ready") throw new BadRequestException(`ZIP job is not ready (status: ${job.status})`);
        return { path: job.filePath, name: job.downloadName };
    }

    cancel(id: string): ZipJobView {
        const job = this.jobs.get(id);
        if (!job) throw new NotFoundException("ZIP job not found or expired");
        if (job.status === "processing" || job.status === "pending") {
            job.cancelled = true;
            job.status = "cancelled";
            this.emit(job);
        }
        return this.toView(job);
    }

    /** Pre-flight: enumerate keys+sizes under a prefix and enforce the size guardrail. */
    private async enumerate(bucket: Bucket, prefix?: string): Promise<{ keys: { key: string; size: number }[]; totalBytes: number }> {
        const keys: { key: string; size: number }[] = [];
        let totalBytes = 0;
        let token: string | undefined;
        do {
            const res = await this.s3.listObjects(bucket, { prefix: prefix || undefined, continuationToken: token, maxKeys: 1000 });
            for (const o of res.objects) {
                if (!o.Key || o.Key.endsWith("/")) continue; // skip folder placeholders
                keys.push({ key: o.Key, size: o.Size ?? 0 });
                totalBytes += o.Size ?? 0;
            }
            token = res.nextToken ?? undefined;
        } while (token);
        return { keys, totalBytes };
    }

    /** Create + start a background ZIP job. Returns the initial job view. */
    async createJob(bucket: Bucket, rawPrefix?: string): Promise<ZipJobView> {
        const prefix = rawPrefix ? normalizePrefix(rawPrefix) : "";
        const listPrefix = prefix ? `${prefix}/` : "";
        const { keys, totalBytes } = await this.enumerate(bucket, listPrefix);

        if (keys.length === 0) throw new BadRequestException("Nothing to archive: no objects under this path");
        if (totalBytes > this.maxBytes) {
            throw new BadRequestException(
                `Archive too large: ${totalBytes} bytes exceeds the limit of ${this.maxBytes} bytes`
            );
        }

        await mkdir(this.tmpDir, { recursive: true });
        const id = randomUUID();
        const filePath = join(this.tmpDir, `${id}.zip`);
        const label = prefix ? prefix.replace(/\//g, "-") : bucket.bucketName;
        const downloadName = `${bucket.publicId}-${label}.zip`;

        const job: ZipJob = {
            id,
            bucketId: bucket.id,
            bucketPublicId: bucket.publicId,
            prefix: prefix || null,
            status: "pending",
            totalBytes,
            processedBytes: 0,
            totalFiles: keys.length,
            processedFiles: 0,
            error: null,
            filePath,
            downloadName,
            cancelled: false,
            createdAt: new Date(),
            subject: new Subject<ZipJobView>(),
        };
        this.jobs.set(id, job);

        // Run in the background; controller streams progress via SSE.
        void this.run(bucket, job, prefix, keys);
        return this.toView(job);
    }

    private async run(bucket: Bucket, job: ZipJob, prefix: string, keys: { key: string; size: number }[]): Promise<void> {
        const output = createWriteStream(job.filePath);
        // archiver v8: ZipArchive registers the zip format module (base Archiver does not).
        const archive = new ZipArchive({ zlib: { level: 6 } });
        const closed = new Promise<void>((resolve, reject) => {
            output.on("close", () => resolve());
            output.on("error", reject);
            archive.on("error", reject);
            archive.on("warning", (w: ArchiverError) => this.logger.warn(`archiver warning: ${w.message}`));
        });
        archive.pipe(output);

        job.status = "processing";
        this.emit(job);

        try {
            for (const { key, size } of keys) {
                if (job.cancelled) break;
                const stream = await this.s3.getObjectStream(bucket, key);
                // Name inside the zip is relative to the requested prefix.
                const name = prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
                archive.append(stream, { name });
                await new Promise<void>((resolve, reject) => {
                    stream.on("end", () => resolve());
                    stream.on("error", reject);
                });
                job.processedBytes += size;
                job.processedFiles += 1;
                this.emit(job);
            }

            if (job.cancelled) {
                archive.abort();
                await this.safeCleanup(job.filePath);
                job.subject.complete();
                this.scheduleEviction(job.id);
                return;
            }

            await archive.finalize();
            await closed;
            const s = await stat(job.filePath);
            job.processedBytes = job.totalBytes;
            job.processedFiles = job.totalFiles;
            job.status = "ready";
            this.emit(job);
            this.logger.log(`ZIP job ${job.id} ready (${s.size} bytes)`);
            job.subject.complete();
            this.scheduleEviction(job.id);
        } catch (err) {
            job.status = "error";
            job.error = (err as Error).message;
            this.emit(job);
            this.logger.error(`ZIP job ${job.id} failed: ${job.error}`);
            try {
                archive.abort();
            } catch {
                /* ignore */
            }
            await this.safeCleanup(job.filePath);
            job.subject.complete();
            this.scheduleEviction(job.id);
        }
    }

    private scheduleEviction(id: string): void {
        setTimeout(() => {
            const job = this.jobs.get(id);
            if (job) void this.safeCleanup(job.filePath);
            this.jobs.delete(id);
        }, JOB_TTL_MS).unref();
    }

    private async safeCleanup(path: string): Promise<void> {
        try {
            await rm(path, { force: true });
        } catch {
            /* ignore */
        }
    }

    async onModuleDestroy(): Promise<void> {
        for (const job of this.jobs.values()) {
            await this.safeCleanup(job.filePath);
        }
        this.jobs.clear();
    }
}
