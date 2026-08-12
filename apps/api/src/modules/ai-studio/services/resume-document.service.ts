import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { StudioStorageService } from "@/modules/ai-studio/services/studio-storage.service";
import { PdfRenderService } from "@/modules/ai-studio/services/pdf-render.service";

/** ATS resumes must stay within two pages; longer and recruiters stop reading. */
const MAX_PAGES = 2;

export interface DocumentBlock {
    id: string;
    number: number;
    section: string;
    kind: "heading" | "bullet" | "paragraph" | "meta";
    text: string;
    sourceIds?: string[];
    unsupported?: boolean;
}

/**
 * Owns generated resumes and cover letters.
 *
 * A document snapshots its content rather than reading through to live profile
 * rows: once a PDF has reached an employer, editing a project description next
 * month must not make our records disagree with their copy.
 */
@Injectable()
export class ResumeDocumentService {
    private readonly logger = new Logger(ResumeDocumentService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StudioStorageService,
        private readonly renderer: PdfRenderService
    ) {}

    async list(profileId: string) {
        return this.prisma.resumeDocument.findMany({
            where: { profileId },
            orderBy: { createdAt: "desc" },
            include: { posting: { select: { id: true, title: true, company: true } } },
        });
    }

    async getOne(id: string) {
        const doc = await this.prisma.resumeDocument.findUnique({ where: { id } });
        if (!doc) throw new NotFoundException("Document not found");
        return doc;
    }

    /** With a presigned link attached, for the UI. */
    async getWithUrl(id: string) {
        const doc = await this.getOne(id);
        const downloadUrl = doc.storageKey ? await this.storage.presign(doc.storageKey).catch(() => null) : null;
        return { ...doc, downloadUrl };
    }

    /**
     * Build a draft document from a profile — the snapshot the preview renders
     * and Chromium prints. Nothing is stored in object storage yet; only
     * {@link generatePdf} writes a file.
     */
    async createDraft(params: {
        profileId: string;
        postingId?: string | null;
        kind?: "resume" | "cover_letter";
        title?: string;
        content?: Record<string, unknown>;
        blocks?: DocumentBlock[];
        model?: string | null;
        warnings?: string[];
        /** Applied to the snapshot: drops the items ranked out, uses rewritten bullets. */
        tailoring?: {
            decisions: Array<{ itemId: string; itemType: string; included: boolean }>;
            summary: string[];
            rewrittenPoints: Record<string, string[]>;
        };
    }) {
        const profile = await this.prisma.candidateProfile.findUnique({
            where: { id: params.profileId },
            include: {
                projectItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                experienceItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                educationItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
                skillItems: { orderBy: { sortOrder: "asc" } },
                linkItems: { orderBy: { sortOrder: "asc" } },
            },
        });
        if (!profile) throw new NotFoundException("Person not found");

        let content = params.content ?? buildContent(profile);
        if (!params.content && params.tailoring) content = applyTailoring(content as ReturnType<typeof buildContent>, params.tailoring);
        const blocks = params.blocks ?? buildBlocks(content as ReturnType<typeof buildContent>);

        const posting = params.postingId
            ? await this.prisma.jobPosting.findUnique({
                  where: { id: params.postingId },
                  select: { company: true, title: true },
              })
            : null;

        return this.prisma.resumeDocument.create({
            data: {
                profileId: params.profileId,
                postingId: params.postingId ?? null,
                kind: params.kind ?? "resume",
                format: "pdf",
                title: params.title ?? defaultTitle(profile.name, posting?.company, posting?.title),
                contentJson: content as Prisma.InputJsonValue,
                blocks: blocks as unknown as Prisma.InputJsonValue,
                model: params.model ?? null,
                warnings: (params.warnings ?? []) as Prisma.InputJsonValue,
            },
        });
    }

    /** Hand-edit a draft before generating. Edits go into the snapshot. */
    async updateContent(id: string, content: Record<string, unknown>, blocks?: DocumentBlock[]) {
        await this.getOne(id);
        return this.prisma.resumeDocument.update({
            where: { id },
            data: {
                contentJson: content as Prisma.InputJsonValue,
                ...(blocks ? { blocks: blocks as unknown as Prisma.InputJsonValue } : {}),
            },
        });
    }

    /** Replace the text of one numbered block — what "fix line 12" resolves to. */
    async updateBlock(id: string, blockId: string, text: string) {
        const doc = await this.getOne(id);
        const blocks = (doc.blocks as unknown as DocumentBlock[] | null) ?? [];
        const target = blocks.find((b) => b.id === blockId);
        if (!target) throw new BadRequestException(`No block "${blockId}" in this document`);

        const content = doc.contentJson as Record<string, unknown>;
        replaceInContent(content, target.text, text);
        target.text = text;
        // A hand-edit is evidence the user reviewed it; drop the guard's flag.
        target.unsupported = false;

        return this.prisma.resumeDocument.update({
            where: { id },
            data: {
                contentJson: content as Prisma.InputJsonValue,
                blocks: blocks as unknown as Prisma.InputJsonValue,
            },
        });
    }

    /**
     * Render to PDF, store it, and record where it went.
     *
     * This is the only path that writes to object storage — previews stay
     * ephemeral, so discarded drafts do not accumulate in the bucket.
     */
    async generatePdf(id: string) {
        const doc = await this.getOne(id);
        const { pdf, pageCount } = await this.renderer.render(doc.id);

        const fileName = `${slug(doc.title)}.pdf`;
        const stored = await this.storage.put(
            this.storage.documentFolder(doc.profileId, doc.id),
            fileName,
            pdf,
            "application/pdf"
        );

        const warnings = [...((doc.warnings as string[] | null) ?? [])];
        if (pageCount > MAX_PAGES) {
            warnings.push(
                `This resume runs to ${pageCount} pages. Two is the limit recruiters read — trim the weakest bullets or drop a project.`
            );
        }

        const updated = await this.prisma.resumeDocument.update({
            where: { id },
            data: {
                bucketId: stored.bucketId,
                folder: stored.folder,
                fileName: stored.fileName,
                storageKey: stored.storageKey,
                sizeBytes: stored.sizeBytes,
                pageCount,
                warnings: warnings as Prisma.InputJsonValue,
            },
        });

        return { ...updated, downloadUrl: await this.storage.presign(stored.storageKey) };
    }

    async remove(id: string) {
        const doc = await this.getOne(id);
        if (doc.storageKey) {
            await this.storage.remove(doc.storageKey).catch((err) => {
                this.logger.warn(`Could not delete ${doc.storageKey}: ${(err as Error).message}`);
            });
        }
        await this.prisma.resumeDocument.delete({ where: { id } });
        return { id };
    }
}

/* ─── content assembly ───────────────────────────────────────── */

type ProfileWithItems = Prisma.CandidateProfileGetPayload<{
    include: {
        projectItems: true;
        experienceItems: true;
        educationItems: true;
        skillItems: true;
        linkItems: true;
    };
}>;

/**
 * Narrow a snapshot to what tailoring selected.
 *
 * Applied to the *snapshot*, never to the profile: dropping a project for one
 * job must not remove it from the person's record.
 */
export function applyTailoring(
    content: ReturnType<typeof buildContent>,
    tailoring: {
        decisions: Array<{ itemId: string; itemType: string; included: boolean }>;
        summary: string[];
        rewrittenPoints: Record<string, string[]>;
    }
): ReturnType<typeof buildContent> {
    const dropped = new Set(tailoring.decisions.filter((d) => !d.included).map((d) => d.itemId));
    const rank = new Map(tailoring.decisions.map((d, i) => [d.itemId, i]));

    return {
        ...content,
        summary: tailoring.summary.length ? tailoring.summary : content.summary,
        projects: content.projects
            .filter((p) => !dropped.has(p.id))
            .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)),
        experience: content.experience.map((e) => {
            const rewritten = tailoring.rewrittenPoints[e.id];
            return rewritten?.length ? { ...e, points: rewritten } : e;
        }),
    };
}

export function buildContent(profile: ProfileWithItems) {
    // Contacts print as bare text, never as links — an ATS reads the text layer,
    // and a hyperlink adds nothing it can parse.
    const contacts = [
        profile.email,
        profile.phone,
        profile.location,
        ...profile.linkItems.map((l) => stripScheme(l.url)),
    ].filter((v): v is string => Boolean(v));

    return {
        name: profile.name,
        headline: profile.headline,
        contacts,
        summary: splitSummary(profile.summary),
        experience: profile.experienceItems,
        projects: profile.projectItems,
        skills: profile.skillItems,
        education: profile.educationItems,
    };
}

/** Flatten the document into addressable, numbered blocks. */
export function buildBlocks(content: ReturnType<typeof buildContent>): DocumentBlock[] {
    const blocks: DocumentBlock[] = [];
    let n = 1;
    const push = (b: Omit<DocumentBlock, "number">) => blocks.push({ ...b, number: n++ });

    for (const line of content.summary) {
        push({ id: `summary-${n}`, section: "Summary", kind: "paragraph", text: line });
    }
    for (const job of content.experience) {
        push({
            id: `exp-${job.id}-head`,
            section: "Experience",
            kind: "heading",
            text: `${job.position} — ${job.company}`,
            sourceIds: [job.id],
        });
        for (const [i, point] of ((job.points as string[] | null) ?? []).entries()) {
            push({ id: `exp-${job.id}-${i}`, section: "Experience", kind: "bullet", text: point, sourceIds: [job.id] });
        }
    }
    for (const project of content.projects) {
        push({
            id: `proj-${project.id}-head`,
            section: "Projects",
            kind: "heading",
            text: project.name,
            sourceIds: [project.id],
        });
        if (project.description) {
            push({
                id: `proj-${project.id}-desc`,
                section: "Projects",
                kind: "paragraph",
                text: project.description,
                sourceIds: [project.id],
            });
        }
    }
    for (const edu of content.education) {
        push({
            id: `edu-${edu.id}`,
            section: "Education",
            kind: "heading",
            text: `${edu.degree} — ${edu.institution}`,
            sourceIds: [edu.id],
        });
    }
    return blocks;
}

/** Swap one block's text wherever it appears in the snapshot. */
function replaceInContent(content: Record<string, unknown>, from: string, to: string) {
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                if (node[i] === from) node[i] = to;
                else walk(node[i]);
            }
            return;
        }
        if (node && typeof node === "object") {
            for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
                if (value === from) (node as Record<string, unknown>)[key] = to;
                else walk(value);
            }
        }
    };
    walk(content);
}

function splitSummary(summary: string | null): string[] {
    if (!summary?.trim()) return [];
    return summary
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
}

/** Contacts read better without the protocol; the text is what gets parsed. */
function stripScheme(url: string): string {
    return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function defaultTitle(name: string, company?: string | null, role?: string | null): string {
    return [name, role, company].filter(Boolean).join(" - ");
}

/** Filename an employer will see in their inbox — keep it human. */
function slug(value: string): string {
    return (
        value
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 120) || "Resume"
    );
}
