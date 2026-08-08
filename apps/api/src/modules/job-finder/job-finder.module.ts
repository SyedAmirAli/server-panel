import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { LLM_PROVIDER } from "@/modules/job-finder/llm/llm.types";
import { OpenAiCompatibleProvider } from "@/modules/job-finder/llm/openai-compatible.provider";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { RemotiveSource } from "@/modules/job-finder/sources/remotive.source";
import { RemoteOkSource } from "@/modules/job-finder/sources/remoteok.source";
import { ArbeitnowSource } from "@/modules/job-finder/sources/arbeitnow.source";
import { JobicySource } from "@/modules/job-finder/sources/jobicy.source";
import { AdzunaSource } from "@/modules/job-finder/sources/adzuna.source";
import { UrlImportSource } from "@/modules/job-finder/sources/url-import.source";
import { LinkedInEmailSource } from "@/modules/job-finder/sources/linkedin-email.source";
import { JobSourceRegistry } from "@/modules/job-finder/sources/job-source.registry";
import { CandidateProfileService } from "@/modules/job-finder/services/candidate-profile.service";
import { JobFinderSettingsService } from "@/modules/job-finder/services/job-finder-settings.service";
import { JobMatchingService } from "@/modules/job-finder/services/job-matching.service";
import { JobPostingsService } from "@/modules/job-finder/services/job-postings.service";
import { JobRunService } from "@/modules/job-finder/services/job-run.service";
import { JobSchedulerService } from "@/modules/job-finder/services/job-scheduler.service";
import { JobApplicationService } from "@/modules/job-finder/services/job-application.service";
import { JobFinderAdminController } from "@/modules/job-finder/job-finder.admin.controller";

/**
 * Job Finder / Job Application Assistant.
 *
 * Self-contained and additive: it registers its own routes under
 * `admin/job-finder/*` and depends only on `AuthModule` (for `AdminGuard`) and
 * the global `PrismaModule`. Its cron job is registered dynamically at runtime,
 * so the app's existing scheduled work is untouched.
 *
 * Swap LLM vendors by rebinding `LLM_PROVIDER` — no call site changes.
 */
@Module({
    imports: [AuthModule],
    controllers: [JobFinderAdminController],
    providers: [
        { provide: LLM_PROVIDER, useClass: OpenAiCompatibleProvider },
        LlmService,

        // Discovery adapters + registry
        RemotiveSource,
        RemoteOkSource,
        ArbeitnowSource,
        JobicySource,
        AdzunaSource,
        UrlImportSource,
        LinkedInEmailSource,
        JobSourceRegistry,

        // Domain services
        CandidateProfileService,
        JobFinderSettingsService,
        JobMatchingService,
        JobPostingsService,
        JobRunService,
        JobSchedulerService,
        JobApplicationService,
    ],
    exports: [CandidateProfileService, JobPostingsService],
})
export class JobFinderModule {}
