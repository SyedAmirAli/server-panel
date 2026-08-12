import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { ProfileCompositionService } from "@/modules/ai-studio/services/profile-composition.service";
import {
    FACT_EXTRACTION_SYSTEM_PROMPT,
    renderDocumentForExtraction,
} from "@/modules/ai-studio/prompts/fact-extraction.prompt";
import { clampText } from "@/modules/job-finder/sources/source.utils";

const TARGET_TYPES = new Set(["project", "experience", "skill", "link", "field"]);
const FIELD_KEYS = new Set(["headline", "summary", "location", "phone", "email", "availability", "bio"]);

interface RawProposal {
    targetType?: string;
    confidence?: number;
    payload?: Record<string, unknown>;
}

/**
 * Derives candidate facts from a document, then holds them for review.
 *
 * Nothing here writes to the profile on its own. Auto-merging would mean one
 * bad OCR pass quietly poisoning every resume generated afterwards — and nobody
 * rereads a profile before hitting Execute, so the error would surface in front
 * of an employer rather than here.
 */
@Injectable()
export class FactProposalService {
    private readonly logger = new Logger(FactProposalService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly llm: LlmService,
        private readonly composition: ProfileCompositionService
    ) {}

    /* ─── queue ──────────────────────────────────────────────── */

    async list(profileId: string, status = "pending") {
        const where: Prisma.ProfileFactProposalWhereInput = {
            profileId,
            ...(status === "all" ? {} : { status }),
        };
        const [rows, total] = await Promise.all([
            this.prisma.profileFactProposal.findMany({
                where,
                orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
                include: { infoItem: { select: { id: true, title: true, kind: true, fileName: true } } },
            }),
            this.prisma.profileFactProposal.count({ where }),
        ]);
        return { data: rows, total };
    }

    /* ─── generation ─────────────────────────────────────────── */

    /** Read one info item and queue whatever it evidences. */
    async generateForItem(infoItemId: string) {
        const item = await this.prisma.profileInfoItem.findUnique({ where: { id: infoItemId } });
        if (!item) throw new NotFoundException("Info item not found");
        if (!item.rawText?.trim()) {
            throw new BadRequestException(
                "This item has no extracted text yet — run extraction on it before proposing facts."
            );
        }
        if (!this.llm.isConfigured()) {
            throw new BadRequestException("Fact extraction needs an LLM. Set AI_BASE_URL and AI_API_KEY, then retry.");
        }

        // Existing skills go in so the model does not re-propose what is already there.
        const existingSkills = (
            await this.prisma.profileSkill.findMany({
                where: { profileId: item.profileId },
                select: { name: true },
            })
        ).map((s) => s.name);

        const { value, result } = await this.llm.completeJson<{ proposals?: RawProposal[] }>(
            [
                { role: "system", content: FACT_EXTRACTION_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: renderDocumentForExtraction({
                        title: item.title,
                        kind: item.kind,
                        text: clampText(item.rawText, 24_000) ?? "",
                        existingSkills,
                    }),
                },
            ],
            { temperature: 0.1, maxTokens: 4000, json: true }
        );

        const clean = (value?.proposals ?? [])
            .map((p) => this.sanitize(p))
            .filter((p): p is { targetType: string; confidence: number; payload: Record<string, unknown> } => p !== null);

        // Every proposal ever made from this item, whatever its status — not just
        // the pending ones. A fact the user already accepted or rejected is a fact
        // they have decided on; re-proposing it would let a second accept create a
        // duplicate row, and would resurrect things they deliberately turned down.
        const existing = await this.prisma.profileFactProposal.findMany({
            where: { infoItemId },
            select: { targetType: true, payload: true },
        });
        const seen = new Set(existing.map((e) => fingerprint(e.targetType, e.payload as Record<string, unknown>)));

        // Filter against the batch as well as the stored queue: a model asked for
        // facts from one document will happily name the same project twice, and
        // checking only what is already persisted lets both copies through on the
        // first run.
        const fresh: typeof clean = [];
        for (const p of clean) {
            const fp = fingerprint(p.targetType, p.payload);
            if (seen.has(fp)) continue;
            seen.add(fp);
            fresh.push(p);
        }

        if (fresh.length) {
            await this.prisma.profileFactProposal.createMany({
                data: fresh.map((p) => ({
                    profileId: item.profileId,
                    infoItemId: item.id,
                    targetType: p.targetType,
                    payload: p.payload as Prisma.InputJsonValue,
                    confidence: p.confidence,
                    model: result.model,
                })),
            });
        }

        return {
            proposed: fresh.length,
            skippedDuplicates: clean.length - fresh.length,
            discarded: (value?.proposals ?? []).length - clean.length,
            model: result.model,
        };
    }

    /* ─── review ─────────────────────────────────────────────── */

    /** Accept a proposal, writing the real profile row it describes. */
    async accept(id: string) {
        const proposal = await this.prisma.profileFactProposal.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException("Proposal not found");
        if (proposal.status !== "pending") {
            throw new BadRequestException(`This proposal was already ${proposal.status}.`);
        }

        const payload = (proposal.payload ?? {}) as Record<string, unknown>;
        const profileId = proposal.profileId;
        let createdRowId: string | null = null;

        switch (proposal.targetType) {
            case "project": {
                const row = await this.prisma.profileProject.create({
                    data: {
                        profileId,
                        name: str(payload.name) || "Untitled project",
                        description: str(payload.description) || null,
                        role: str(payload.role) || null,
                        period: str(payload.period) || null,
                        stack: strArray(payload.stack) as Prisma.InputJsonValue,
                        note: str(payload.note) || null,
                        url: str(payload.url) || null,
                        sortOrder: await this.nextOrder("profileProject", profileId),
                    },
                });
                createdRowId = row.id;
                break;
            }
            case "experience": {
                const row = await this.prisma.profileExperience.create({
                    data: {
                        profileId,
                        company: str(payload.company) || "Unknown",
                        position: str(payload.position) || "Unknown",
                        period: str(payload.period) || "",
                        location: str(payload.location) || null,
                        employmentType: str(payload.employmentType) || null,
                        points: strArray(payload.points) as Prisma.InputJsonValue,
                        stack: strArray(payload.stack) as Prisma.InputJsonValue,
                        sortOrder: await this.nextOrder("profileExperience", profileId),
                    },
                });
                createdRowId = row.id;
                break;
            }
            case "skill": {
                const name = str(payload.name);
                if (!name) throw new BadRequestException("Proposal has no skill name");
                // Accepting a skill that already exists must not 500 on the unique index.
                const existing = await this.prisma.profileSkill.findFirst({
                    where: { profileId, name: { equals: name, mode: "insensitive" } },
                });
                if (existing) {
                    createdRowId = existing.id;
                } else {
                    const row = await this.prisma.profileSkill.create({
                        data: {
                            profileId,
                            name,
                            category: str(payload.category) || null,
                            sortOrder: await this.nextOrder("profileSkill", profileId),
                        },
                    });
                    createdRowId = row.id;
                }
                break;
            }
            case "link": {
                const url = str(payload.url);
                if (!url) throw new BadRequestException("Proposal has no URL");
                const row = await this.prisma.profileLink.create({
                    data: {
                        profileId,
                        label: str(payload.label) || "Link",
                        url,
                        kind: linkKind(url),
                        sortOrder: await this.nextOrder("profileLink", profileId),
                    },
                });
                createdRowId = row.id;
                break;
            }
            case "field": {
                const key = str(payload.key);
                const val = str(payload.value);
                if (!FIELD_KEYS.has(key)) throw new BadRequestException(`Unsupported profile field "${key}"`);
                await this.prisma.candidateProfile.update({ where: { id: profileId }, data: { [key]: val } });
                createdRowId = profileId;
                break;
            }
            default:
                throw new BadRequestException(`Unsupported proposal type "${proposal.targetType}"`);
        }

        const updated = await this.prisma.profileFactProposal.update({
            where: { id },
            data: { status: "accepted", reviewedAt: new Date(), createdRowId },
        });
        await this.composition.syncDerivedJson(profileId);
        return updated;
    }

    async reject(id: string) {
        const proposal = await this.prisma.profileFactProposal.findUnique({ where: { id } });
        if (!proposal) throw new NotFoundException("Proposal not found");
        return this.prisma.profileFactProposal.update({
            where: { id },
            data: { status: "rejected", reviewedAt: new Date() },
        });
    }

    async rejectAll(profileId: string) {
        const res = await this.prisma.profileFactProposal.updateMany({
            where: { profileId, status: "pending" },
            data: { status: "rejected", reviewedAt: new Date() },
        });
        return { rejected: res.count };
    }

    /* ─── helpers ────────────────────────────────────────────── */

    /**
     * Drop anything malformed rather than storing it. A proposal that cannot be
     * turned into a row is noise in the review queue, and a queue full of noise
     * is a queue nobody reads carefully.
     */
    private sanitize(
        raw: RawProposal
    ): { targetType: string; confidence: number; payload: Record<string, unknown> } | null {
        const targetType = str(raw.targetType);
        if (!TARGET_TYPES.has(targetType)) return null;
        const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : null;
        if (!payload) return null;

        if (targetType === "project" && !str(payload.name)) return null;
        if (targetType === "experience" && !(str(payload.company) && str(payload.position))) return null;
        if (targetType === "skill" && !str(payload.name)) return null;
        if (targetType === "link" && !/^https?:\/\//i.test(str(payload.url))) return null;
        if (targetType === "field" && !(FIELD_KEYS.has(str(payload.key)) && str(payload.value))) return null;

        const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence ?? 0)) || 0));
        return { targetType, confidence, payload };
    }

    private async nextOrder(
        model: "profileProject" | "profileExperience" | "profileSkill" | "profileLink",
        profileId: string
    ): Promise<number> {
        // @ts-expect-error — delegates share this shape but not a common type
        const last = await this.prisma[model].findFirst({
            where: { profileId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
        });
        return (last?.sortOrder ?? -1) + 1;
    }
}

/* ─── module-local helpers ───────────────────────────────────── */

function str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function strArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function linkKind(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("github.com")) return "github";
    return "portfolio";
}

/** Identity for de-duplication — the fields a human would call "the same fact". */
function fingerprint(targetType: string, payload: Record<string, unknown>): string {
    const key = {
        project: () => str(payload.name),
        experience: () => `${str(payload.company)}|${str(payload.position)}|${str(payload.period)}`,
        skill: () => str(payload.name),
        link: () => str(payload.url),
        field: () => `${str(payload.key)}|${str(payload.value)}`,
    }[targetType];
    return `${targetType}:${(key?.() ?? JSON.stringify(payload)).toLowerCase()}`;
}
