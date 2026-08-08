import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Subject, filter, map } from "rxjs";
import type { JobRunLog, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { JobSourceRegistry } from "@/modules/job-finder/sources/job-source.registry";
import { FetchContext, NormalizedPosting } from "@/modules/job-finder/sources/job-source.types";
import { dedupeHash, matchesKeywords } from "@/modules/job-finder/sources/source.utils";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { CandidateProfileService } from "@/modules/job-finder/services/candidate-profile.service";
import { JobMatchingService } from "@/modules/job-finder/services/job-matching.service";

/**
 * Executes the discovery pipeline: fetch → filter → dedupe → persist → score.
 *
 * Every step emits a log line that is both persisted (so a finished run can be
 * replayed) and pushed onto an in-process stream (so the terminal view can
 * follow a run live over SSE).
 */
@Injectable()
export class JobRunService {
    private readonly logger = new Logger(JobRunService.name);

    /** Live log fan-out. Persisted rows are the durable copy; this is for SSE. */
    private readonly logStream = new Subject<JobRunLog>();

    /** Guards against overlapping runs — cron firing on top of a manual run. */
    private activeRunId: string | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: JobSourceRegistry,
        private readonly settings: JobFinderSettingsService,
        private readonly profiles: CandidateProfileService,
        private readonly matching: JobMatchingService
    ) {}

    get isRunning(): boolean {
        return this.activeRunId !== null;
    }

    /** SSE feed for one run. */
    streamFor(runId: string) {
        return this.logStream.pipe(
            filter((log) => log.runId === runId),
            map((log) => ({ data: log }))
        );
    }

    async listRuns(take = 20) {
        return this.prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take });
    }

    async getRun(id: string) {
        const run = await this.prisma.jobRun.findUnique({
            where: { id },
            include: { logs: { orderBy: { seq: "asc" } } },
        });
        if (!run) throw new NotFoundException("Run not found");
        return run;
    }

    /** Most recent run — what the UI shows on load. */
    async latestRun() {
        return this.prisma.jobRun.findFirst({
            orderBy: { startedAt: "desc" },
            include: { logs: { orderBy: { seq: "asc" } } },
        });
    }

    /**
     * Start a run. Returns as soon as the run row exists so "Find Now" responds
     * immediately; the pipeline continues in the background and is followed via
     * the log stream.
     */
    async start(trigger: "manual" | "cron"): Promise<{ id: string }> {
        if (this.activeRunId) {
            throw new ConflictException("A discovery run is already in progress.");
        }

        const run = await this.prisma.jobRun.create({ data: { trigger, status: "running" } });
        this.activeRunId = run.id;

        // Deliberately not awaited: the HTTP call returns now, the run continues.
        void this.execute(run.id).catch((err) => {
            this.logger.error(`Run ${run.id} crashed: ${(err as Error).message}`);
        });

        return { id: run.id };
    }

    private async execute(runId: string): Promise<void> {
        let seq = 0;
        const log = async (
            level: "debug" | "info" | "warn" | "error" | "success",
            message: string,
            data?: Record<string, unknown>,
            source?: string
        ) => {
            const row = await this.prisma.jobRunLog.create({
                data: {
                    runId,
                    seq: seq++,
                    level,
                    message,
                    source: source ?? null,
                    data: data ? (data as Prisma.InputJsonValue) : undefined,
                },
            });
            this.logStream.next(row);
        };

        const stats = { discovered: 0, deduped: 0, inserted: 0, scored: 0, errors: 0 };
        const sourcesRun: string[] = [];
        let status: "success" | "partial" | "failed" = "success";
        let fatal: string | null = null;

        try {
            const settings = await this.settings.resolved();
            const since = new Date(Date.now() - settings.lookbackHours * 3_600_000);

            await log("info", `Run started — window: last ${settings.lookbackHours}h (since ${since.toISOString()})`);
            if (settings.keywords.length) await log("info", `Keywords: ${settings.keywords.join(", ")}`);

            const rows = await this.prisma.jobSource.findMany({ where: { isActive: true } });
            if (!rows.length) await log("warn", "No active job sources — enable at least one in settings.");

            /* ── Fetch ─────────────────────────────────────────── */
            const all: Array<{ posting: NormalizedPosting; sourceId: string; sourceKey: string }> = [];

            for (const row of rows) {
                const adapter = this.registry.get(row.adapter);
                if (!adapter) {
                    await log("warn", `No adapter registered for "${row.adapter}" — skipping`, undefined, row.key);
                    continue;
                }
                if (!adapter.isReady()) {
                    await log(
                        "warn",
                        `${adapter.name} is missing credentials — skipping`,
                        undefined,
                        row.key
                    );
                    continue;
                }

                sourcesRun.push(row.key);
                const started = Date.now();
                await log("info", `→ ${adapter.name}: fetching…`, undefined, row.key);

                const ctx: FetchContext = {
                    since,
                    keywords: settings.keywords,
                    locations: settings.locations,
                    limit: settings.maxJobsPerRun,
                    config: (row.config as Record<string, unknown>) ?? {},
                    log: (level, message, data) => log(level, message, data, row.key),
                };

                try {
                    const found = await adapter.fetchJobs(ctx);
                    stats.discovered += found.length;
                    all.push(...found.map((posting) => ({ posting, sourceId: row.id, sourceKey: row.key })));

                    await log(
                        "success",
                        `✓ ${adapter.name}: ${found.length} posting(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
                        { count: found.length },
                        row.key
                    );
                    await this.prisma.jobSource.update({
                        where: { id: row.id },
                        data: { lastRunAt: new Date(), lastRunStatus: "success", lastRunError: null },
                    });
                } catch (err) {
                    stats.errors++;
                    status = "partial";
                    const message = (err as Error).message;
                    await log("error", `✗ ${adapter.name} failed: ${message}`, undefined, row.key);
                    await this.prisma.jobSource.update({
                        where: { id: row.id },
                        data: { lastRunAt: new Date(), lastRunStatus: "failed", lastRunError: message },
                    });
                }
            }

            /* ── Filter + dedupe ───────────────────────────────── */
            await log("info", `Discovered ${stats.discovered} posting(s) across ${sourcesRun.length} source(s)`);

            const excluded = new Set(settings.excludeCompanies.map((c) => c.toLowerCase()));
            const seen = new Map<string, { posting: NormalizedPosting; sourceId: string; sourceKey: string }>();
            let droppedWindow = 0;
            let droppedKeyword = 0;
            let droppedExcluded = 0;

            for (const entry of all) {
                const { posting } = entry;
                if (!posting.title?.trim() || !posting.company?.trim() || !posting.url?.trim()) continue;

                if (!posting.postedAt || posting.postedAt.getTime() < since.getTime()) {
                    droppedWindow++;
                    continue;
                }
                if (!matchesKeywords(posting, settings.keywords)) {
                    droppedKeyword++;
                    continue;
                }
                if (excluded.has(posting.company.trim().toLowerCase())) {
                    droppedExcluded++;
                    continue;
                }

                const hash = dedupeHash(posting);
                // First source to report a job wins; later duplicates are dropped.
                if (!seen.has(hash)) seen.set(hash, entry);
            }

            stats.deduped = seen.size;
            await log(
                "info",
                `Filtered → ${seen.size} unique in-window posting(s) ` +
                    `(dropped ${droppedWindow} outside ${settings.lookbackHours}h, ${droppedKeyword} off-keyword, ${droppedExcluded} excluded)`
            );

            /* ── Persist ───────────────────────────────────────── */
            const freshIds: string[] = [];

            for (const [hash, { posting, sourceId }] of seen) {
                const existing = await this.prisma.jobPosting.findUnique({
                    where: { dedupeHash: hash },
                    select: { id: true },
                });
                if (existing) continue; // already known from an earlier run

                const created = await this.prisma.jobPosting.create({
                    data: {
                        sourceId,
                        externalId: posting.externalId ?? null,
                        dedupeHash: hash,
                        title: posting.title.slice(0, 255),
                        company: posting.company.slice(0, 191),
                        companyUrl: posting.companyUrl ?? null,
                        location: posting.location?.slice(0, 191) ?? null,
                        isRemote: posting.isRemote,
                        employmentType: posting.employmentType?.slice(0, 64) ?? null,
                        salaryRaw: posting.salaryRaw?.slice(0, 191) ?? null,
                        salaryMin: posting.salaryMin ?? null,
                        salaryMax: posting.salaryMax ?? null,
                        currency: posting.currency?.slice(0, 8) ?? null,
                        url: posting.url,
                        applyUrl: posting.applyUrl ?? null,
                        applyEmail: posting.applyEmail?.slice(0, 191) ?? null,
                        description: posting.description ?? null,
                        tags: posting.tags ?? [],
                        postedAt: posting.postedAt ?? null,
                        raw: posting.raw ? (JSON.parse(JSON.stringify(posting.raw)) as object) : undefined,
                    },
                    select: { id: true },
                });
                freshIds.push(created.id);
            }

            stats.inserted = freshIds.length;
            await log("success", `Saved ${freshIds.length} new posting(s) (${seen.size - freshIds.length} already known)`);

            /* ── Score ─────────────────────────────────────────── */
            if (freshIds.length) {
                const profile = await this.profiles.getActive();

                if (!profile) {
                    status = "partial";
                    await log("warn", "No candidate profile — import your resume to enable star ratings");
                } else {
                    await log("info", `Scoring ${freshIds.length} posting(s) against "${profile.name}"…`);

                    const toScore = await this.prisma.jobPosting.findMany({
                        where: { id: { in: freshIds.slice(0, settings.maxJobsPerRun) } },
                    });

                    const outcome = await this.matching.scoreMany(toScore, profile, {
                        model: settings.scoringModel,
                        log: (level, message, data) => log(level, message, data, "scoring"),
                    });

                    stats.scored = outcome.scored;
                    stats.errors += outcome.failed;
                    if (outcome.failed) status = "partial";

                    await log("success", `Scored ${outcome.scored} posting(s)${outcome.failed ? `, ${outcome.failed} failed` : ""}`);
                }
            }

            await log(
                status === "success" ? "success" : "warn",
                `Run finished — ${stats.inserted} new, ${stats.scored} scored, ${stats.errors} error(s)`,
                stats
            );
        } catch (err) {
            status = "failed";
            fatal = (err as Error).message;
            stats.errors++;
            this.logger.error(`Run ${runId} failed: ${fatal}`);
            await log("error", `Run failed: ${fatal}`).catch(() => undefined);
        } finally {
            await this.prisma.jobRun
                .update({
                    where: { id: runId },
                    data: { status, finishedAt: new Date(), sourcesRun, stats, error: fatal },
                })
                .catch(() => undefined);
            this.activeRunId = null;
        }
    }
}
