import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { JobRunService } from "@/modules/job-finder/services/job-run.service";

/**
 * Owns the Job Finder's cron job.
 *
 * The schedule lives in the settings row rather than in a decorator, so it is
 * registered dynamically and re-registered whenever the admin changes it —
 * no restart needed. Only this module's job is touched; the mail sync's own
 * scheduled work is untouched.
 */
@Injectable()
export class JobSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(JobSchedulerService.name);

    /** Registry key for our single cron job. */
    private static readonly JOB_NAME = "job-finder-discovery";

    constructor(
        private readonly scheduler: SchedulerRegistry,
        private readonly settings: JobFinderSettingsService,
        private readonly runs: JobRunService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.sync();
    }

    /**
     * Bring the registered cron job in line with the current settings.
     * Safe to call repeatedly — it always tears down before rebuilding.
     */
    async sync(): Promise<{ enabled: boolean; cronExpression: string; nextRun: string | null }> {
        const settings = await this.settings.get();
        this.clear();

        if (!settings.cronEnabled) {
            this.logger.log("Scheduled discovery is disabled");
            return { enabled: false, cronExpression: settings.cronExpression, nextRun: null };
        }

        try {
            const job = new CronJob(settings.cronExpression, () => void this.fire());
            this.scheduler.addCronJob(JobSchedulerService.JOB_NAME, job as never);
            job.start();

            const nextRun = job.nextDate().toJSDate().toISOString();
            this.logger.log(`Scheduled discovery enabled (${settings.cronExpression}) — next run ${nextRun}`);
            return { enabled: true, cronExpression: settings.cronExpression, nextRun };
        } catch (err) {
            // A bad expression must not take the module down — log and stay off.
            this.logger.error(`Invalid cron expression "${settings.cronExpression}": ${(err as Error).message}`);
            return { enabled: false, cronExpression: settings.cronExpression, nextRun: null };
        }
    }

    /** Next fire time, or null when disabled. */
    nextRun(): string | null {
        try {
            const job = this.scheduler.getCronJob(JobSchedulerService.JOB_NAME);
            return job.nextDate().toJSDate().toISOString();
        } catch {
            return null;
        }
    }

    private async fire(): Promise<void> {
        if (this.runs.isRunning) {
            this.logger.warn("Skipping scheduled run — a run is already in progress");
            return;
        }
        try {
            const { id } = await this.runs.start("cron");
            this.logger.log(`Scheduled discovery run started (${id})`);
        } catch (err) {
            this.logger.error(`Scheduled run could not start: ${(err as Error).message}`);
        }
    }

    private clear(): void {
        try {
            this.scheduler.deleteCronJob(JobSchedulerService.JOB_NAME);
        } catch {
            // Not registered yet — nothing to remove.
        }
    }
}
