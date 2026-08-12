import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Sse,
    UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { PrismaService } from "@/prisma/prisma.service";
import { CandidateProfileService } from "@/modules/job-finder/services/candidate-profile.service";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { JobPostingsService } from "@/modules/job-finder/services/job-postings.service";
import { JobRunService } from "@/modules/job-finder/services/job-run.service";
import { JobSchedulerService } from "@/modules/job-finder/services/job-scheduler.service";
import { JobApplicationService } from "@/modules/job-finder/services/job-application.service";
import { ImportProfileDto } from "@/modules/job-finder/dto/import-profile.dto";
import { UpdateJobFinderSettingsDto } from "@/modules/job-finder/dto/update-settings.dto";
import { ListPostingsQueryDto } from "@/modules/job-finder/dto/list-postings.dto";
import {
    ImportJobUrlDto,
    MarkApplicationSentDto,
    UpdateApplicationDto,
    UpdateJobSourceDto,
    UpdatePostingStatusDto,
} from "@/modules/job-finder/dto/job-actions.dto";

@ApiTags("Job Finder — Admin")
@ApiBearerAuth("admin")
@Controller("admin/job-finder")
@UseGuards(AdminGuard)
export class JobFinderAdminController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly profiles: CandidateProfileService,
        private readonly settings: JobFinderSettingsService,
        private readonly postings: JobPostingsService,
        private readonly runs: JobRunService,
        private readonly scheduler: JobSchedulerService,
        private readonly applications: JobApplicationService
    ) {}

    /* ─── Overview ───────────────────────────────────────────── */

    @Get("overview")
    @ApiOperation({ summary: "Dashboard counters for the Job Finder" })
    async overview() {
        const [total, shortlisted, applied, profile, latestRun, settings] = await Promise.all([
            this.prisma.jobPosting.count({ where: { status: { notIn: ["archived", "dismissed"] } } }),
            this.prisma.jobPosting.count({ where: { status: "shortlisted" } }),
            this.prisma.jobPosting.count({ where: { status: "applied" } }),
            this.profiles.getActive(),
            this.runs.latestRun(),
            this.settings.get(),
        ]);

        const strong = await this.prisma.jobMatch.count({ where: { stars: { gte: 4 } } });

        return {
            postings: { total, shortlisted, applied, strongMatches: strong },
            profile: profile ? { id: profile.id, name: profile.name, updatedAt: profile.updatedAt } : null,
            latestRun,
            isRunning: this.runs.isRunning,
            schedule: {
                enabled: settings.cronEnabled,
                cronExpression: settings.cronExpression,
                nextRun: this.scheduler.nextRun(),
            },
        };
    }

    /* ─── Candidate profiles ─────────────────────────────────── */

    @Get("profiles")
    @ApiOperation({ summary: "List normalized candidate profiles" })
    listProfiles() {
        return this.profiles.list();
    }

    @Get("profiles/active")
    @ApiOperation({ summary: "Get the profile used for matching and drafting" })
    activeProfile() {
        return this.profiles.getActive();
    }

    @Get("profiles/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Get one candidate profile" })
    getProfile(@Param("id") id: string) {
        return this.profiles.getOne(id);
    }

    @Post("profiles/import")
    @ApiOperation({ summary: "Import/normalize the profile from the resume repository (read-only on the source)" })
    async importProfile(@Body() dto: ImportProfileDto) {
        const { profile, reused, sourcePath } = await this.profiles.importFromResume({
            path: dto.path,
            force: dto.force,
        });
        return reused
            ? ApiResponse.info(profile, `Resume unchanged — reusing the existing profile (${sourcePath})`)
            : ApiResponse.success(profile, `Profile imported from ${sourcePath}`);
    }

    @Post("profiles/:id/default")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Mark a profile as the default" })
    async setDefaultProfile(@Param("id") id: string) {
        return ApiResponse.success(await this.profiles.setDefault(id), "Default profile updated");
    }

    @Delete("profiles/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Delete a profile (never touches the resume repository)" })
    async removeProfile(@Param("id") id: string) {
        const profile = await this.profiles.remove(id);
        return ApiResponse.success({ id: profile.id }, "Profile deleted");
    }

    /* ─── Settings & schedule ────────────────────────────────── */

    @Get("settings")
    @ApiOperation({ summary: "Get Job Finder settings" })
    async getSettings() {
        const settings = await this.settings.get();
        return { ...settings, nextRun: this.scheduler.nextRun() };
    }

    @Put("settings")
    @ApiOperation({ summary: "Update settings (re-registers the cron schedule immediately)" })
    async updateSettings(@Body() dto: UpdateJobFinderSettingsDto) {
        const settings = await this.settings.update(dto);
        const schedule = await this.scheduler.sync();
        return ApiResponse.success(
            { ...settings, nextRun: schedule.nextRun },
            schedule.enabled ? `Settings saved — next run ${schedule.nextRun}` : "Settings saved — schedule is off"
        );
    }

    /* ─── Sources ────────────────────────────────────────────── */

    @Get("sources")
    @ApiOperation({ summary: "List discovery sources and their last-run state" })
    listSources() {
        return this.prisma.jobSource.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    }

    @Patch("sources/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Enable/disable a source or change its config" })
    async updateSource(@Param("id") id: string, @Body() dto: UpdateJobSourceDto) {
        const source = await this.prisma.jobSource.update({
            where: { id },
            data: {
                ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
                ...(dto.config !== undefined && { config: dto.config as object }),
            },
        });
        return ApiResponse.success(source, `${source.name} ${source.isActive ? "enabled" : "disabled"}`);
    }

    /* ─── Runs ───────────────────────────────────────────────── */

    @Post("runs")
    @ApiOperation({ summary: 'Start a discovery run now ("Find Now")' })
    async startRun() {
        const { id } = await this.runs.start("manual");
        return ApiResponse.queued({ id }, "Discovery run started");
    }

    @Get("runs")
    @ApiOperation({ summary: "List recent runs" })
    listRuns() {
        return this.runs.listRuns();
    }

    @Get("runs/latest")
    @ApiOperation({ summary: "Most recent run with its full log" })
    latestRun() {
        return this.runs.latestRun();
    }

    @Get("runs/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "One run with its full log" })
    getRun(@Param("id") id: string) {
        return this.runs.getRun(id);
    }

    /** Live terminal feed. GET, so it stays outside the response envelope. */
    @Sse("runs/:id/stream")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Server-sent stream of a run's log lines" })
    streamRun(@Param("id") id: string) {
        return this.runs.streamFor(id);
    }

    /* ─── Postings ───────────────────────────────────────────── */

    @Get("postings")
    @ApiOperation({ summary: "List found jobs, newest first, with star ratings" })
    listPostings(@Query() query: ListPostingsQueryDto) {
        return this.postings.list(query);
    }

    @Get("postings/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "One posting with its match and any drafts" })
    getPosting(@Param("id") id: string) {
        return this.postings.getOne(id);
    }

    @Post("postings/import-url")
    @ApiOperation({ summary: "Import a posting from a URL and score it" })
    async importUrl(@Body() dto: ImportJobUrlDto) {
        const posting = await this.postings.importFromUrl(dto.url);
        return ApiResponse.success(posting, "Job imported and scored");
    }

    @Patch("postings/:id/status")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Shortlist, dismiss or archive a posting" })
    async setPostingStatus(@Param("id") id: string, @Body() dto: UpdatePostingStatusDto) {
        const posting = await this.postings.setStatus(id, dto.status);
        return ApiResponse.success(posting, `Marked as ${dto.status}`);
    }

    @Post("postings/:id/rescore")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Re-rate a posting against the current profile" })
    async rescore(@Param("id") id: string) {
        const match = await this.postings.rescore(id);
        return ApiResponse.success(match, `Re-rated at ${match.stars}★`);
    }

    @Delete("postings/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Delete a posting" })
    async removePosting(@Param("id") id: string) {
        const posting = await this.postings.remove(id);
        return ApiResponse.success({ id: posting.id }, "Posting deleted");
    }

    /* ─── Applications ───────────────────────────────────────── */

    @Post("postings/:id/application")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Draft a tailored application email for a posting" })
    async generateApplication(@Param("id") id: string) {
        const application = await this.applications.generate(id);
        return ApiResponse.success(application, "Draft ready — attach your CV before sending");
    }

    @Get("postings/:id/applications")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "List drafts for a posting" })
    listApplications(@Param("id") id: string) {
        return this.applications.listForPosting(id);
    }

    @Get("applications/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Get one application draft" })
    getApplication(@Param("id") id: string) {
        return this.applications.getOne(id);
    }

    @Put("applications/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Edit a draft before sending" })
    async updateApplication(@Param("id") id: string, @Body() dto: UpdateApplicationDto) {
        return ApiResponse.success(await this.applications.update(id, dto), "Draft updated");
    }

    @Post("applications/:id/sent")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Record that an application was sent (does not send it)" })
    async markSent(@Param("id") id: string, @Body() dto: MarkApplicationSentDto) {
        const application = await this.applications.markSent(id, dto.sentMessageId);
        return ApiResponse.success(application, "Marked as sent");
    }

    @Delete("applications/:id")
    @ApiParam({ name: "id" })
    @ApiOperation({ summary: "Delete a draft" })
    async removeApplication(@Param("id") id: string) {
        const application = await this.applications.remove(id);
        return ApiResponse.success({ id: application.id }, "Draft deleted");
    }
}
