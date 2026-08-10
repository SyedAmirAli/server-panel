import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { StorageModule } from "@/modules/storage/storage.module";
import { ProfileCompositionService } from "@/modules/ai-studio/services/profile-composition.service";
import { StudioStorageService } from "@/modules/ai-studio/services/studio-storage.service";
import { PeopleService } from "@/modules/ai-studio/services/people.service";
import { InfoItemService } from "@/modules/ai-studio/services/info-item.service";
import { ExtractionService } from "@/modules/ai-studio/services/extraction.service";
import { OcrService } from "@/modules/ai-studio/services/ocr.service";
import { FactProposalService } from "@/modules/ai-studio/services/fact-proposal.service";
import { LlmService } from "@/modules/job-finder/llm/llm.service";
import { PdfRenderService } from "@/modules/ai-studio/services/pdf-render.service";
import { ResumeDocumentService } from "@/modules/ai-studio/services/resume-document.service";
import { AdminSseGuard } from "@/modules/storage/admin-sse.guard";
import { ConversationService } from "@/modules/ai-studio/services/conversation.service";
import { StudioToolsService } from "@/modules/ai-studio/services/studio-tools.service";
import { StudioChatService } from "@/modules/ai-studio/services/studio-chat.service";
import { TailoringService } from "@/modules/ai-studio/services/tailoring.service";
import { ApplicationSendService } from "@/modules/ai-studio/services/application-send.service";
import { ApplicationPreparationService } from "@/modules/ai-studio/services/application-preparation.service";
import { MailsModule } from "@/modules/mails/mails.module";
import { LLM_PROVIDER } from "@/modules/job-finder/llm/llm.types";
import { OpenAiCompatibleProvider } from "@/modules/job-finder/llm/openai-compatible.provider";
import { PeopleAdminController } from "@/modules/ai-studio/people.admin.controller";
import { StudioAdminController } from "@/modules/ai-studio/studio.admin.controller";

/**
 * AI Studio — resume builder, cover letters and the in-app data assistant.
 *
 * Additive module: it reads the same `CandidateProfile` Job Finder scores
 * against, but owns the relational detail beneath it. Nothing here modifies
 * Job Finder's behaviour.
 */
@Module({
    imports: [AuthModule, StorageModule, MailsModule], // AuthModule provides AdminGuard's JwtService
    controllers: [PeopleAdminController, StudioAdminController],
    providers: [
        ProfileCompositionService,
        StudioStorageService,
        PeopleService,
        InfoItemService,
        ExtractionService,
        OcrService,
        FactProposalService,
        LlmService,
        PdfRenderService,
        ResumeDocumentService,
        AdminSseGuard,
        ConversationService,
        StudioToolsService,
        StudioChatService,
        TailoringService,
        ApplicationSendService,
        ApplicationPreparationService,
        // Provider-agnostic by contract: swapping hosts means binding a different
        // class here, with no call-site changes.
        { provide: LLM_PROVIDER, useClass: OpenAiCompatibleProvider },
    ],
    exports: [
        ProfileCompositionService,
        StudioStorageService,
        PeopleService,
        InfoItemService,
        ExtractionService,
        OcrService,
        FactProposalService,
        PdfRenderService,
        ResumeDocumentService,
        ConversationService,
        StudioToolsService,
        StudioChatService,
        TailoringService,
        ApplicationSendService,
        ApplicationPreparationService,
        LLM_PROVIDER,
    ],
})
export class AiStudioModule {}
