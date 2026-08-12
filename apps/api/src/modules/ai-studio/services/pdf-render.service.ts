import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import puppeteer, { type Browser } from "puppeteer";

export interface RenderResult {
    pdf: Buffer;
    pageCount: number;
}

/** How long a single render may take before it is abandoned. */
const RENDER_TIMEOUT_MS = 45_000;

/**
 * Prints a document by driving headless Chromium against the app's own print
 * route.
 *
 * Chromium was chosen over a PDF-drawing library because it produces a real text
 * layer — a rasterised resume scores zero in an ATS, which would defeat the
 * entire feature — and because it reuses the React template and print CSS
 * unchanged.
 *
 * Renders are **serialised**. Each Chromium page costs well over a hundred MB,
 * and this process shares a VM with the API, the IMAP sync and the job runner;
 * two concurrent renders under memory pressure is how the whole thing gets
 * OOM-killed.
 */
@Injectable()
export class PdfRenderService implements OnModuleDestroy {
    private readonly logger = new Logger(PdfRenderService.name);
    private browser: Browser | null = null;
    /** Tail of the render queue — each job awaits the previous one. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly config: ConfigService,
        private readonly jwt: JwtService
    ) {}

    async onModuleDestroy() {
        await this.browser?.close().catch(() => undefined);
    }

    /** Queue a render. Resolves with the PDF once every earlier job has finished. */
    render(documentId: string): Promise<RenderResult> {
        const job = this.queue.then(
            () => this.renderNow(documentId),
            // A previous failure must not poison the queue for everyone behind it.
            () => this.renderNow(documentId)
        );
        this.queue = job.catch(() => undefined);
        return job;
    }

    private async browserInstance(): Promise<Browser> {
        if (this.browser?.connected) return this.browser;
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                // The API commonly runs as root in a container, where the sandbox
                // cannot initialise; /dev/shm is typically 64 MB there and Chromium
                // will crash rendering anything substantial without this.
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        });
        this.logger.log("Chromium launched for PDF rendering");
        return this.browser;
    }

    private async renderNow(documentId: string): Promise<RenderResult> {
        const browser = await this.browserInstance();
        const page = await browser.newPage();

        try {
            // Chromium cannot send an Authorization header when navigating, so the
            // print route accepts a short-lived token in the query string. Minted
            // per render and valid for two minutes rather than reusing a session
            // token that could leak through logs or history.
            const token = await this.jwt.signAsync(
                { role: "admin", scope: "print" },
                { secret: this.config.get<string>("JWT_SECRET"), expiresIn: "2m" }
            );

            const port = this.config.get<string>("API_PORT") ?? "4010";
            const url = `http://127.0.0.1:${port}/print/resume/${documentId}?token=${encodeURIComponent(token)}`;

            page.setDefaultTimeout(RENDER_TIMEOUT_MS);
            await page.goto(url, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });
            // Wait for the document to actually be on the page — networkidle can
            // settle before React has painted the fetched content.
            await page.waitForSelector('[data-print-ready="true"] .a4-page', { timeout: RENDER_TIMEOUT_MS });

            const pdf = Buffer.from(
                await page.pdf({
                    format: "A4",
                    printBackground: true,
                    // Margins come from the page's own padding; see the @page rule.
                    margin: { top: "0", right: "0", bottom: "0", left: "0" },
                    preferCSSPageSize: true,
                })
            );

            return { pdf, pageCount: countPdfPages(pdf) };
        } finally {
            await page.close().catch(() => undefined);
        }
    }
}

/**
 * Page count straight from the PDF's own object graph.
 *
 * Measuring the rendered DOM height would only ever be an estimate — Chromium's
 * pagination depends on break rules the browser applies at print time — so this
 * counts what actually came out.
 */
export function countPdfPages(pdf: Buffer): number {
    const text = pdf.toString("latin1");

    // Preferred: the page tree's declared count.
    const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    if (counts.length) return Math.max(...counts);

    // Fallback: count the page objects themselves.
    const pages = text.match(/\/Type\s*\/Page\b/g);
    return pages ? pages.length : 1;
}
