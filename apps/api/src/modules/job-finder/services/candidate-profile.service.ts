import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "@/prisma/prisma.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { PROFILE_EXTRACTION_SYSTEM_PROMPT } from "@/modules/job-finder/prompts/profile-extraction.prompt";

/**
 * Builds and owns the normalized `CandidateProfile`.
 *
 * The resume repository is treated as a **read-only upstream**: this service
 * only ever `readFile`s from it. The normalized profile stored here — not the
 * resume repo — is the source of truth for matching and application drafting.
 */
@Injectable()
export class CandidateProfileService {
    private readonly logger = new Logger(CandidateProfileService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly llm: LlmService
    ) {}

    /** Configured resume location — a repo directory or a single file. */
    get resumePath(): string {
        return this.config.get<string>("RESUME_SOURCE_PATH") ?? "";
    }

    async list() {
        return this.prisma.candidateProfile.findMany({
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        });
    }

    async getOne(id: string) {
        const profile = await this.prisma.candidateProfile.findUnique({ where: { id } });
        if (!profile) throw new NotFoundException("Candidate profile not found");
        return profile;
    }

    /**
     * The profile used for scoring/drafting: the one pinned in settings, else
     * the default, else the most recently updated.
     */
    async getActive() {
        const settings = await this.prisma.jobFinderSetting.findUnique({ where: { id: "default" } });

        if (settings?.activeProfileId) {
            const pinned = await this.prisma.candidateProfile.findUnique({
                where: { id: settings.activeProfileId },
            });
            if (pinned) return pinned;
        }

        return this.prisma.candidateProfile.findFirst({
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        });
    }

    /**
     * Import (or re-import) the profile from the resume repo.
     *
     * Re-importing is idempotent by content: if the source hash is unchanged and
     * `force` is false, the existing profile is returned untouched.
     */
    async importFromResume(options: { path?: string; force?: boolean } = {}) {
        const sourcePath = options.path?.trim() || this.resumePath;
        if (!sourcePath) {
            throw new BadRequestException(
                "No resume source configured. Set RESUME_SOURCE_PATH or pass an explicit path."
            );
        }

        const { file, raw } = await this.readResumeSource(sourcePath);
        const sourceHash = createHash("sha256").update(raw).digest("hex");

        const existing = await this.prisma.candidateProfile.findFirst({ where: { sourceHash } });
        if (existing && !options.force) {
            this.logger.log(`Resume unchanged (${sourceHash.slice(0, 12)}…) — reusing profile ${existing.id}`);
            return { profile: existing, reused: true, sourcePath: file };
        }

        if (!this.llm.isConfigured()) {
            throw new BadRequestException(
                "Resume normalization needs an LLM. Set AI_BASE_URL and AI_API_KEY, then retry."
            );
        }

        const normalized = await this.normalize(raw);

        const data = {
            name: normalized.name,
            headline: normalized.headline ?? null,
            email: normalized.email ?? null,
            phone: normalized.phone ?? null,
            location: normalized.location ?? null,
            timezone: normalized.timezone ?? null,
            availability: normalized.availability ?? null,
            summary: normalized.summary ?? null,
            titles: normalized.titles ?? [],
            skills: normalized.skills ?? [],
            experience: normalized.experience ?? [],
            education: normalized.education ?? [],
            projects: normalized.projects ?? [],
            certifications: normalized.certifications ?? undefined,
            languages: normalized.languages ?? undefined,
            links: normalized.links ?? undefined,
            sourceType: "repo",
            sourcePath: file,
            sourceHash,
            rawSource: raw,
        };

        // One profile per source file — re-imports update in place rather than
        // accumulating near-duplicates.
        const prior = await this.prisma.candidateProfile.findFirst({ where: { sourcePath: file } });

        const profile = prior
            ? await this.prisma.candidateProfile.update({ where: { id: prior.id }, data })
            : await this.prisma.candidateProfile.create({
                  data: { ...data, isDefault: (await this.prisma.candidateProfile.count()) === 0 },
              });

        this.logger.log(
            `Imported profile "${profile.name}" from ${file} — ` +
                `${normalized.experience?.length ?? 0} roles, ${normalized.skills?.length ?? 0} skills`
        );

        return { profile, reused: false, sourcePath: file };
    }

    async setDefault(id: string) {
        await this.getOne(id);
        await this.prisma.$transaction([
            this.prisma.candidateProfile.updateMany({ data: { isDefault: false }, where: { isDefault: true } }),
            this.prisma.candidateProfile.update({ where: { id }, data: { isDefault: true } }),
        ]);
        return this.getOne(id);
    }

    async remove(id: string) {
        await this.getOne(id);
        return this.prisma.candidateProfile.delete({ where: { id } });
    }

    /**
     * Locate the best resume source, mirroring the precedence the resume repo's
     * own job-application skill uses: structured data first, then a "detailed"
     * CV PDF, then any CV PDF.
     */
    private async readResumeSource(sourcePath: string): Promise<{ file: string; raw: string }> {
        let info: Awaited<ReturnType<typeof stat>>;
        try {
            info = await stat(sourcePath);
        } catch {
            throw new BadRequestException(`Resume source not found: ${sourcePath}`);
        }

        if (info.isFile()) {
            return { file: sourcePath, raw: await this.readTextFile(sourcePath) };
        }

        const structured = join(sourcePath, "src", "constants", "data.tsx");
        if (await exists(structured)) {
            return { file: structured, raw: await this.readTextFile(structured) };
        }

        const entries = await readdir(sourcePath).catch(() => [] as string[]);
        const pdfs = entries.filter((f) => f.toLowerCase().endsWith(".pdf"));
        const detailed = pdfs.find((f) => /detail/i.test(f));
        const cv = detailed ?? pdfs.find((f) => /cv|resume/i.test(f));

        if (cv) {
            throw new BadRequestException(
                `Only a PDF resume was found (${cv}). PDF extraction isn't wired up yet — ` +
                    `point RESUME_SOURCE_PATH at a structured source such as src/constants/data.tsx, ` +
                    `or pass the resume text directly.`
            );
        }

        throw new BadRequestException(
            `No resume source found under ${sourcePath} (looked for src/constants/data.tsx and a CV PDF).`
        );
    }

    private async readTextFile(path: string): Promise<string> {
        const raw = await readFile(path, "utf8");
        if (!raw.trim()) throw new BadRequestException(`Resume source is empty: ${path}`);
        return raw;
    }

    /** Turn the raw resume source into the normalized profile shape. */
    private async normalize(raw: string): Promise<NormalizedProfile> {
        const { value } = await this.llm.completeJson<NormalizedProfile>(
            [
                { role: "system", content: PROFILE_EXTRACTION_SYSTEM_PROMPT },
                { role: "user", content: `Resume source:\n\n${raw.slice(0, 120_000)}` },
            ],
            { temperature: 0, maxTokens: 12_000, timeoutMs: 180_000 }
        );

        if (!value?.name || typeof value.name !== "string") {
            throw new BadRequestException("Resume normalization produced no candidate name — aborting import.");
        }
        if (!Array.isArray(value.experience) || value.experience.length === 0) {
            throw new BadRequestException(
                "Resume normalization produced no work experience — aborting rather than storing a profile that would understate you."
            );
        }

        return value;
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

interface NormalizedProfile {
    name: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    timezone?: string;
    availability?: string;
    summary?: string;
    titles?: string[];
    skills?: Array<{ name: string; category?: string; highlighted?: boolean }>;
    experience?: Array<{
        company: string;
        position: string;
        period: string;
        location?: string;
        employmentType?: string;
        points: string[];
        stack?: string[];
    }>;
    education?: Array<{ institution: string; degree: string; period: string; location?: string }>;
    projects?: Array<{
        name: string;
        description: string;
        stack?: string[];
        note?: string;
        metrics?: Array<[string, string]>;
    }>;
    certifications?: string[];
    languages?: string[];
    links?: Array<{ label: string; url: string }>;
}
