import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ProfileInfoItem } from "@prisma/client";
import { StudioStorageService } from "@/modules/ai-studio/services/studio-storage.service";
import { InfoItemService } from "@/modules/ai-studio/services/info-item.service";

// Required from its internal path on purpose: pdf-parse's index.js contains a
// debug block that reads a bundled test PDF when it thinks it is the entrypoint,
// which throws under some build setups. The lib file has no such side effect.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
    data: Buffer,
    opts?: Record<string, unknown>
) => Promise<{ text: string; numpages: number; info?: Record<string, unknown> }>;

/**
 * A PDF with fewer than this many characters of extractable text is treated as
 * a scan. Real CVs run to thousands; a scanned page yields a handful of stray
 * ligatures at most.
 */
const SCANNED_PDF_TEXT_THRESHOLD = 120;

export interface ExtractionOutcome {
    itemId: string;
    status: "done" | "failed" | "needs_ocr";
    chars: number;
    pages?: number;
    message?: string;
}

/**
 * Pulls text out of uploaded attachments.
 *
 * Extraction is deliberately non-fatal: a failure is recorded on the item so it
 * stays retryable and the uploaded file is never lost because a parse went
 * wrong.
 */
@Injectable()
export class ExtractionService {
    private readonly logger = new Logger(ExtractionService.name);

    constructor(
        private readonly storage: StudioStorageService,
        private readonly items: InfoItemService,
        private readonly config: ConfigService
    ) {}

    /** Extract one item. Images are handled by the OCR path, not here. */
    async extractOne(item: ProfileInfoItem): Promise<ExtractionOutcome> {
        if (!item.storageKey) {
            await this.items.markExtractionFailed(item.id, "No stored file to extract from");
            return { itemId: item.id, status: "failed", chars: 0, message: "no stored file" };
        }

        try {
            const buffer = await this.storage.getBuffer(item.storageKey);

            if (item.kind === "pdf") return await this.extractPdf(item, buffer);
            if (item.kind === "textfile") {
                const text = buffer.toString("utf8");
                await this.items.markExtracted(item.id, text, null);
                return { itemId: item.id, status: "done", chars: text.length };
            }

            // Images are the OCR service's job.
            return { itemId: item.id, status: "needs_ocr", chars: 0, message: "image requires OCR" };
        } catch (err) {
            const message = (err as Error).message ?? "Extraction failed";
            this.logger.warn(`Extraction failed for ${item.id}: ${message}`);
            await this.items.markExtractionFailed(item.id, message);
            return { itemId: item.id, status: "failed", chars: 0, message };
        }
    }

    private async extractPdf(item: ProfileInfoItem, buffer: Buffer): Promise<ExtractionOutcome> {
        const parsed = await pdfParse(buffer);
        const text = tidy(parsed.text ?? "");

        // A PDF with no text layer is a scan. Say so explicitly rather than
        // storing an empty string that later looks like a successful extraction
        // of a genuinely empty document.
        if (text.length < SCANNED_PDF_TEXT_THRESHOLD) {
            const message =
                `Only ${text.length} characters of text in ${parsed.numpages} page(s) — this looks like a scanned PDF. ` +
                `Run OCR on it, or upload a text-based PDF.`;
            await this.items.markExtractionFailed(item.id, message);
            return {
                itemId: item.id,
                status: "needs_ocr",
                chars: text.length,
                pages: parsed.numpages,
                message,
            };
        }

        await this.items.markExtracted(item.id, text, null);
        return { itemId: item.id, status: "done", chars: text.length, pages: parsed.numpages };
    }

    /** Extract every pending item, optionally scoped to one candidate. */
    async extractPending(profileId?: string): Promise<ExtractionOutcome[]> {
        const pending = await this.items.pending(profileId);
        const results: ExtractionOutcome[] = [];
        // Serial on purpose — PDF parsing is CPU-bound and this shares a process
        // with the API.
        for (const item of pending) results.push(await this.extractOne(item));
        return results;
    }
}

/**
 * PDF text extraction leaves ragged whitespace: hard-wrapped lines, runs of
 * spaces from column layout, and stacks of blank lines between pages.
 */
function tidy(raw: string): string {
    return raw
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
