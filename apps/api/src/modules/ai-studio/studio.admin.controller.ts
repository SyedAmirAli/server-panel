import { Body, Controller, Delete, Get, Param, Post, Put, Query, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { map, type Observable } from "rxjs";
import { AdminGuard } from "@/auth/admin.guard";
import { AdminSseGuard } from "@/modules/storage/admin-sse.guard";
import { ApiResponse } from "@/common/api-response";
import { ResumeDocumentService } from "@/modules/ai-studio/services/resume-document.service";
import { ConversationService } from "@/modules/ai-studio/services/conversation.service";
import { StudioChatService } from "@/modules/ai-studio/services/studio-chat.service";
import { TailoringService } from "@/modules/ai-studio/services/tailoring.service";
import { ApplicationSendService } from "@/modules/ai-studio/services/application-send.service";
import { ApplicationPreparationService } from "@/modules/ai-studio/services/application-preparation.service";

@ApiTags("AI Studio — Documents")
@ApiBearerAuth("admin")
@Controller("admin/studio")
export class StudioAdminController {
    constructor(
        private readonly documents: ResumeDocumentService,
        private readonly conversations: ConversationService,
        private readonly chat: StudioChatService,
        private readonly tailoring: TailoringService,
        private readonly sender: ApplicationSendService,
        private readonly preparation: ApplicationPreparationService
    ) {}

    /**
     * Content for the print route.
     *
     * Guarded by {@link AdminSseGuard} rather than {@link AdminGuard} because
     * headless Chromium cannot attach an Authorization header when navigating —
     * the same accommodation the SSE endpoints already make. The renderer mints a
     * two-minute token for exactly this call.
     */
    @Get("documents/:id/content")
    @UseGuards(AdminSseGuard)
    getDocumentContent(@Param("id") id: string) {
        return this.documents.getOne(id);
    }

    @Get("documents")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Documents generated for a candidate" })
    listDocuments(@Query("profileId") profileId: string) {
        return this.documents.list(profileId);
    }

    @Get("documents/:id")
    @UseGuards(AdminGuard)
    getDocument(@Param("id") id: string) {
        return this.documents.getWithUrl(id);
    }

    @Post("documents")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Create a draft document snapshot (nothing is stored yet)" })
    async createDocument(
        @Body() body: { profileId: string; postingId?: string; kind?: "resume" | "cover_letter"; title?: string }
    ) {
        const doc = await this.documents.createDraft(body);
        return ApiResponse.success(doc, "Draft created");
    }

    @Put("documents/:id/blocks/:blockId")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Rewrite one numbered block" })
    async updateBlock(
        @Param("id") id: string,
        @Param("blockId") blockId: string,
        @Body() body: { text: string }
    ) {
        return ApiResponse.success(await this.documents.updateBlock(id, blockId, body.text), "Block updated");
    }

    @Post("documents/:id/generate")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Render to PDF, store it, and return a shareable link" })
    async generate(@Param("id") id: string) {
        const doc = await this.documents.generatePdf(id);
        const warnings = (doc.warnings as string[] | null) ?? [];
        return warnings.length
            ? ApiResponse.warning(doc, warnings[warnings.length - 1])
            : ApiResponse.success(doc, `PDF generated — ${doc.pageCount} page(s)`);
    }

    @Delete("documents/:id")
    @UseGuards(AdminGuard)
    async removeDocument(@Param("id") id: string) {
        return ApiResponse.success(await this.documents.remove(id), "Document deleted");
    }

    /* ─── conversations ──────────────────────────────────────── */

    @Get("conversations")
    @UseGuards(AdminGuard)
    listConversations(@Query("profileId") profileId?: string) {
        return this.conversations.list(profileId);
    }

    @Get("conversations/:id")
    @UseGuards(AdminGuard)
    getConversation(@Param("id") id: string) {
        return this.conversations.getOne(id);
    }

    @Post("conversations")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Start a conversation; mode follows what you attach" })
    async createConversation(@Body() body: { profileId?: string; postingId?: string }) {
        return ApiResponse.success(await this.conversations.create(body), "Conversation started");
    }

    @Put("conversations/:id/context")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Attach or detach a person/job mid-conversation" })
    async setContext(@Param("id") id: string, @Body() body: { profileId?: string | null; postingId?: string | null }) {
        return ApiResponse.success(await this.conversations.setContext(id, body), "Context updated");
    }

    @Put("conversations/:id/title")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Rename a conversation" })
    async renameConversation(@Param("id") id: string, @Body() body: { title: string }) {
        return ApiResponse.success(await this.conversations.rename(id, body.title), "Renamed");
    }

    @Delete("conversations/:id")
    @UseGuards(AdminGuard)
    async removeConversation(@Param("id") id: string) {
        return ApiResponse.success(await this.conversations.remove(id), "Conversation deleted");
    }

    @Post("conversations/:id/ask")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Ask a question; progress also streams on /stream" })
    async ask(
        @Param("id") id: string,
        @Body()
        body: {
            question: string;
            jobText?: string;
            documentId?: string;
            emailConfigId?: string;
            toEmail?: string;
        }
    ) {
        const { question, ...attachments } = body;
        const result = await this.chat.ask(id, question, attachments);
        return ApiResponse.success(result, "Answered");
    }

    /**
     * Live progress for a conversation. Uses AdminSseGuard because EventSource
     * cannot send an Authorization header.
     */
    @Sse("conversations/:id/stream")
    @UseGuards(AdminSseGuard)
    stream(@Param("id") id: string): Observable<MessageEvent> {
        return this.chat.streamFor(id).pipe(map((event) => ({ data: event }) as MessageEvent));
    }

    /* ─── tailoring ──────────────────────────────────────────── */

    @Post("tailor")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Rank and rewrite a candidate's material for one job" })
    async tailor(@Body() body: { profileId: string; postingId?: string; jobText?: string }) {
        const result = await this.tailoring.tailor(body.profileId, body.postingId ?? null, body.jobText);
        const dropped = result.decisions.filter((d) => !d.included).length;
        const flagged = result.unsupportedClaims.length + result.rejectedTechnologies.length;
        return flagged > 0
            ? ApiResponse.warning(
                  result,
                  `Tailored — ${dropped} item(s) dropped, ${flagged} unsupported claim(s) rejected`
              )
            : ApiResponse.success(result, `Tailored — ${dropped} item(s) dropped for this job`);
    }

    /**
     * Execute: tailor, then build the draft the preview renders. Nothing is
     * stored in object storage until Generate is pressed.
     */
    @Post("execute")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Tailor and produce a preview-ready draft" })
    async execute(@Body() body: { profileId: string; postingId?: string; jobText?: string }) {
        const tailored = await this.tailoring.tailor(body.profileId, body.postingId ?? null, body.jobText);
        const doc = await this.documents.createDraft({
            profileId: body.profileId,
            postingId: body.postingId ?? null,
            tailoring: tailored,
            model: tailored.model,
            warnings: [
                ...tailored.unsupportedClaims.map((c) => `Unsupported claim removed: "${c}"`),
                ...tailored.rejectedTechnologies.map((t) => `"${t}" is not evidenced anywhere in this profile`),
            ],
        });
        return ApiResponse.success({ document: doc, tailoring: tailored }, "Draft ready to preview");
    }

    /* ─── applications ───────────────────────────────────────── */

    @Get("applications")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Application history with the exact documents that went out" })
    history(@Query("profileId") profileId?: string) {
        return this.sender.history(profileId);
    }

    @Put("applications/:id/documents")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Pin which generated documents this application sends" })
    async attachDocuments(
        @Param("id") id: string,
        @Body() body: { resumeDocumentId?: string; coverLetterDocumentId?: string }
    ) {
        return ApiResponse.success(await this.sender.attachDocuments(id, body), "Documents attached");
    }

    @Post("applications/:id/send")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Send the application through the existing mail pipeline" })
    async sendApplication(
        @Param("id") id: string,
        @Body() body: { emailConfigId: string; toEmail?: string; attachResume?: boolean; attachCoverLetter?: boolean }
    ) {
        const result = await this.sender.send({ applicationId: id, ...body });
        return ApiResponse.success(
            result,
            `Sent via ${result.via} with ${result.attachmentCount} attachment(s)`
        );
    }

    /* ─── application preview & approval ─────────────────────── */

    @Get("applications/:id/preview")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "The email, its attachments and the addresses it can be sent from" })
    preview(@Param("id") id: string) {
        return this.preparation.preview(id);
    }

    @Put("applications/:id/preview")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Hand-edit the email before approving it" })
    async editPreview(
        @Param("id") id: string,
        @Body() body: { subject?: string; body?: string; toEmail?: string }
    ) {
        return ApiResponse.success(await this.preparation.update(id, body), "Application updated");
    }

    @Post("applications/:id/cancel")
    @UseGuards(AdminGuard)
    @ApiOperation({ summary: "Discard a prepared application without sending" })
    async cancelApplication(@Param("id") id: string) {
        return ApiResponse.success(await this.preparation.cancel(id), "Application cancelled");
    }
}
