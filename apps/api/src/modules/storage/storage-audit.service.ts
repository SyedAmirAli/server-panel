import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export enum StorageAuditAction {
    BUCKET_CREATE = "storage.bucket.create",
    BUCKET_UPDATE = "storage.bucket.update",
    BUCKET_DELETE = "storage.bucket.delete",
    BUCKET_TOGGLE = "storage.bucket.toggle",
    KEY_CREATE = "storage.key.create",
    KEY_UPDATE = "storage.key.update",
    KEY_DELETE = "storage.key.delete",
    KEY_ROTATE = "storage.key.rotate",
    KEY_TOGGLE = "storage.key.toggle",
    OBJECT_UPLOAD = "storage.object.upload",
    OBJECT_DELETE = "storage.object.delete",
    OBJECT_COPY = "storage.object.copy",
    ZIP_CREATE = "storage.zip.create",
    ZIP_DOWNLOAD = "storage.zip.download",
    ZIP_CANCEL = "storage.zip.cancel",
}

export type AuditActorType = "admin" | "apikey" | "system";

export interface StorageAuditInput {
    action: StorageAuditAction;
    actorType: AuditActorType;
    actorId?: string | null;
    entityType?: string;
    entityId?: string | null;
    metadata?: unknown;
    message?: string;
    headers?: Record<string, unknown>;
}

/** Writes storage-related events to the shared `audit_logs` table (never blocks the request). */
@Injectable()
export class StorageAuditService {
    constructor(private readonly prisma: PrismaService) {}

    private toJson(data: unknown): any {
        if (!data) return null;
        if (typeof data === "object") return JSON.parse(JSON.stringify(data));
        return { data };
    }

    async record(input: StorageAuditInput): Promise<void> {
        const h = input.headers ?? {};
        const ip = (h["cf-connecting-ip"] ?? h["x-forwarded-for"] ?? h["x-real-ip"] ?? "unknown") as string;
        const userAgent = (h["user-agent"] ?? "unknown") as string;
        try {
            await this.prisma.auditLog.create({
                data: {
                    action: input.action,
                    actorType: input.actorType,
                    actorId: input.actorId ?? undefined,
                    entityType: input.entityType,
                    entityId: input.entityId ?? undefined,
                    metadata: this.toJson(input.metadata),
                    ip: typeof ip === "string" ? ip.split(",")[0].trim() : "unknown",
                    userAgent,
                    message: input.message,
                },
            });
        } catch {
            /* auditing must never break the operation */
        }
    }
}
