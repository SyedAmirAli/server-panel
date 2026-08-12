import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, ProfileInfoItem } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { StudioStorageService } from "@/modules/ai-studio/services/studio-storage.service";
import type { CreateNoteDto, ListInfoItemsQueryDto } from "@/modules/ai-studio/dto/info-item.dto";

export interface UploadedFileLike {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

/** 25 MB. Big enough for a scanned multi-page CV, small enough to hold in memory. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const PDF_MIMES = new Set(["application/pdf"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic"]);
const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "text/html"]);

/**
 * Supporting information attached to a candidate: uploaded PDFs, images and
 * text files, plus typed notes.
 *
 * Files land in R2 and keep their extracted text alongside. Extraction never
 * blocks the upload — a failure is recorded on the row so the item stays
 * retryable, rather than losing the file because the gateway was down.
 */
@Injectable()
export class InfoItemService {
    private readonly logger = new Logger(InfoItemService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StudioStorageService
    ) {}

    async list(profileId: string, query: ListInfoItemsQueryDto) {
        await this.assertProfile(profileId);
        const where: Prisma.ProfileInfoItemWhereInput = {
            profileId,
            ...(query.kind ? { kind: query.kind } : {}),
            ...(query.status ? { extractionStatus: query.status } : {}),
        };
        const [rows, total] = await Promise.all([
            this.prisma.profileInfoItem.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: query.limit ?? 50,
                skip: query.offset ?? 0,
                // rawText can be very large; the list view only needs a preview.
                select: {
                    id: true,
                    profileId: true,
                    kind: true,
                    title: true,
                    fileName: true,
                    folder: true,
                    storageKey: true,
                    mimeType: true,
                    sizeBytes: true,
                    extractionStatus: true,
                    extractionError: true,
                    model: true,
                    extractedAt: true,
                    createdAt: true,
                    _count: { select: { proposals: true } },
                },
            }),
            this.prisma.profileInfoItem.count({ where }),
        ]);
        return { data: rows, total };
    }

    async getOne(id: string) {
        const item = await this.prisma.profileInfoItem.findUnique({
            where: { id },
            include: { proposals: { orderBy: { createdAt: "desc" } } },
        });
        if (!item) throw new NotFoundException("Info item not found");
        return item;
    }

    /** A time-limited link to the original file, for reviewing where a fact came from. */
    async downloadUrl(id: string) {
        const item = await this.getOne(id);
        if (!item.storageKey) throw new BadRequestException("This item has no stored file");
        return { url: await this.storage.presign(item.storageKey) };
    }

    /**
     * A typed note. Stored verbatim with no upload and no extraction — it is
     * already text, so running it through a model would only add a way for it to
     * come back wrong.
     */
    async createNote(profileId: string, dto: CreateNoteDto): Promise<ProfileInfoItem> {
        await this.assertProfile(profileId);
        return this.prisma.profileInfoItem.create({
            data: {
                profileId,
                kind: "note",
                title: dto.title?.trim() || null,
                rawText: dto.text,
                extractionStatus: "skipped",
                extractedAt: new Date(),
            },
        });
    }

    /**
     * Store an uploaded file and create its item. Text files are read inline;
     * PDFs and images are left `pending` for the extraction pass.
     */
    async upload(profileId: string, file: UploadedFileLike, title?: string): Promise<ProfileInfoItem> {
        await this.assertProfile(profileId);
        if (!file?.buffer?.length) throw new BadRequestException("No file received");
        if (file.size > MAX_UPLOAD_BYTES) {
            throw new BadRequestException(
                `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
            );
        }

        // Kind comes from the file itself, never from the client: a caller-supplied
        // kind could route a PDF into the image path.
        const kind = detectKind(file.mimetype, file.originalname);
        if (!kind) {
            throw new BadRequestException(
                `Unsupported file type "${file.mimetype}". Upload a PDF, an image, or a text file.`
            );
        }

        // Create first so the row id can namespace the object key.
        const item = await this.prisma.profileInfoItem.create({
            data: {
                profileId,
                kind,
                title: title?.trim() || file.originalname,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                extractionStatus: kind === "textfile" ? "done" : "pending",
                ...(kind === "textfile" ? { rawText: safeUtf8(file.buffer), extractedAt: new Date() } : {}),
            },
        });

        try {
            const stored = await this.storage.put(
                this.storage.attachmentFolder(profileId, item.id),
                file.originalname,
                file.buffer,
                file.mimetype
            );
            return await this.prisma.profileInfoItem.update({
                where: { id: item.id },
                data: {
                    bucketId: stored.bucketId,
                    folder: stored.folder,
                    fileName: stored.fileName,
                    storageKey: stored.storageKey,
                },
            });
        } catch (err) {
            // Don't leave a row pointing at a file that was never stored.
            await this.prisma.profileInfoItem.delete({ where: { id: item.id } }).catch(() => undefined);
            throw new BadRequestException(`Upload failed: ${(err as Error).message}`);
        }
    }

    async remove(id: string) {
        const item = await this.getOne(id);
        if (item.storageKey) {
            // A failed remote delete must not strand the row — log and continue.
            await this.storage.remove(item.storageKey).catch((err) => {
                this.logger.warn(`Could not delete ${item.storageKey} from storage: ${(err as Error).message}`);
            });
        }
        await this.prisma.profileInfoItem.delete({ where: { id } });
        return { id };
    }

    /* ─── used by the extraction pass ────────────────────────── */

    async markExtracted(id: string, rawText: string, model: string | null) {
        return this.prisma.profileInfoItem.update({
            where: { id },
            data: { rawText, extractionStatus: "done", extractionError: null, model, extractedAt: new Date() },
        });
    }

    async markExtractionFailed(id: string, message: string) {
        return this.prisma.profileInfoItem.update({
            where: { id },
            data: { extractionStatus: "failed", extractionError: message.slice(0, 2000) },
        });
    }

    async pending(profileId?: string) {
        return this.prisma.profileInfoItem.findMany({
            where: { extractionStatus: "pending", ...(profileId ? { profileId } : {}) },
            orderBy: { createdAt: "asc" },
        });
    }

    private async assertProfile(profileId: string) {
        const found = await this.prisma.candidateProfile.findUnique({
            where: { id: profileId },
            select: { id: true },
        });
        if (!found) throw new NotFoundException("Person not found");
    }
}

/* ─── helpers ────────────────────────────────────────────────── */

function detectKind(mime: string, filename: string): "pdf" | "image" | "textfile" | null {
    const m = (mime || "").toLowerCase();
    if (PDF_MIMES.has(m)) return "pdf";
    if (IMAGE_MIMES.has(m) || m.startsWith("image/")) return "image";
    if (TEXT_MIMES.has(m) || m.startsWith("text/")) return "textfile";

    // Some browsers send application/octet-stream; fall back to the extension.
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    if (ext === "pdf") return "pdf";
    if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return "image";
    if (["txt", "md", "csv", "json", "log"].includes(ext)) return "textfile";
    return null;
}

/** Decode as UTF-8, refusing binary that slipped through as text/*. */
function safeUtf8(buffer: Buffer): string {
    const text = buffer.toString("utf8");
    // A NUL byte means this was binary mislabelled as text/*.
    if (text.includes("\u0000")) throw new BadRequestException("That file is not readable as text");
    return text;
}
