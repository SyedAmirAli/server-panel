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
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "@/auth/admin.guard";
import { ApiResponse } from "@/common/api-response";
import { PeopleService } from "@/modules/ai-studio/services/people.service";
import { InfoItemService, type UploadedFileLike } from "@/modules/ai-studio/services/info-item.service";
import { ExtractionService } from "@/modules/ai-studio/services/extraction.service";
import { OcrService } from "@/modules/ai-studio/services/ocr.service";
import { FactProposalService } from "@/modules/ai-studio/services/fact-proposal.service";
import {
    BulkSkillsDto,
    CreatePersonDto,
    ListPeopleQueryDto,
    ReorderDto,
    UpdatePersonDto,
    UpsertEducationDto,
    UpsertExperienceDto,
    UpsertLinkDto,
    UpsertProjectDto,
    UpsertSkillDto,
} from "@/modules/ai-studio/dto/people.dto";
import {
    CreateNoteDto,
    ListInfoItemsQueryDto,
    UploadInfoItemDto,
} from "@/modules/ai-studio/dto/info-item.dto";

/**
 * People — candidate records for the Studio.
 *
 * GET returns raw payloads; mutations return the `{ status, message, data }`
 * envelope, per the project convention.
 */
@ApiTags("AI Studio — People")
@ApiBearerAuth("admin")
@Controller("admin/people")
@UseGuards(AdminGuard)
export class PeopleAdminController {
    constructor(
        private readonly people: PeopleService,
        private readonly infoItems: InfoItemService,
        private readonly extraction: ExtractionService,
        private readonly ocr: OcrService,
        private readonly facts: FactProposalService
    ) {}

    /* ─── profile ────────────────────────────────────────────── */

    @Get()
    @ApiOperation({ summary: "List candidates with collection counts" })
    list(@Query() query: ListPeopleQueryDto) {
        return this.people.list(query);
    }

    @Get(":id")
    @ApiOperation({ summary: "Full candidate with every editable collection" })
    @ApiParam({ name: "id" })
    getOne(@Param("id") id: string) {
        return this.people.getOne(id);
    }

    @Post()
    @ApiOperation({ summary: "Create a candidate" })
    async create(@Body() dto: CreatePersonDto) {
        const person = await this.people.create(dto);
        return ApiResponse.success(person, "Person created");
    }

    @Put(":id")
    @ApiOperation({ summary: "Update candidate details" })
    async update(@Param("id") id: string, @Body() dto: UpdatePersonDto) {
        const person = await this.people.update(id, dto);
        return ApiResponse.success(person, "Person updated");
    }

    @Patch(":id/default")
    @ApiOperation({ summary: "Make this the default candidate used for job matching" })
    async setDefault(@Param("id") id: string) {
        const person = await this.people.setDefault(id);
        return ApiResponse.success(person, "Default candidate updated");
    }

    @Post(":id/backfill")
    @ApiOperation({ summary: "Explode an imported profile's JSON into editable rows" })
    async backfill(@Param("id") id: string) {
        const counts = await this.people.backfillFromJson(id);
        return ApiResponse.success(counts, "Profile expanded into editable rows");
    }

    @Delete(":id")
    @ApiOperation({ summary: "Delete a candidate and everything belonging to them" })
    async remove(@Param("id") id: string) {
        const result = await this.people.remove(id);
        const extra =
            result.removedApplications > 0
                ? ` — also removed ${result.removedApplications} application(s) and ${result.removedDocuments} document(s)`
                : "";
        return ApiResponse.success(result, `Person deleted${extra}`);
    }

    /* ─── projects ───────────────────────────────────────────── */

    @Post(":id/projects")
    @ApiOperation({ summary: "Add a project (technology tags required — they drive matching)" })
    async addProject(@Param("id") id: string, @Body() dto: UpsertProjectDto) {
        return ApiResponse.success(await this.people.addProject(id, dto), "Project added");
    }

    @Put("projects/:projectId")
    async updateProject(@Param("projectId") projectId: string, @Body() dto: UpsertProjectDto) {
        return ApiResponse.success(await this.people.updateProject(projectId, dto), "Project updated");
    }

    @Delete("projects/:projectId")
    async removeProject(@Param("projectId") projectId: string) {
        return ApiResponse.success(await this.people.removeProject(projectId), "Project removed");
    }

    /* ─── experience ─────────────────────────────────────────── */

    @Post(":id/experience")
    async addExperience(@Param("id") id: string, @Body() dto: UpsertExperienceDto) {
        return ApiResponse.success(await this.people.addExperience(id, dto), "Experience added");
    }

    @Put("experience/:experienceId")
    async updateExperience(@Param("experienceId") experienceId: string, @Body() dto: UpsertExperienceDto) {
        return ApiResponse.success(await this.people.updateExperience(experienceId, dto), "Experience updated");
    }

    @Delete("experience/:experienceId")
    async removeExperience(@Param("experienceId") experienceId: string) {
        return ApiResponse.success(await this.people.removeExperience(experienceId), "Experience removed");
    }

    /* ─── education ──────────────────────────────────────────── */

    @Post(":id/education")
    async addEducation(@Param("id") id: string, @Body() dto: UpsertEducationDto) {
        return ApiResponse.success(await this.people.addEducation(id, dto), "Education added");
    }

    @Put("education/:educationId")
    async updateEducation(@Param("educationId") educationId: string, @Body() dto: UpsertEducationDto) {
        return ApiResponse.success(await this.people.updateEducation(educationId, dto), "Education updated");
    }

    @Delete("education/:educationId")
    async removeEducation(@Param("educationId") educationId: string) {
        return ApiResponse.success(await this.people.removeEducation(educationId), "Education removed");
    }

    /* ─── skills ─────────────────────────────────────────────── */

    @Post(":id/skills")
    @ApiOperation({ summary: "Add skills in bulk (duplicates are skipped)" })
    async addSkills(@Param("id") id: string, @Body() dto: BulkSkillsDto) {
        const result = await this.people.addSkills(id, dto);
        const skipped = result.submitted - result.added;
        return ApiResponse.success(
            result,
            skipped > 0 ? `${result.added} skill(s) added, ${skipped} already present` : `${result.added} skill(s) added`
        );
    }

    @Put("skills/:skillId")
    async updateSkill(@Param("skillId") skillId: string, @Body() dto: UpsertSkillDto) {
        return ApiResponse.success(await this.people.updateSkill(skillId, dto), "Skill updated");
    }

    @Delete("skills/:skillId")
    async removeSkill(@Param("skillId") skillId: string) {
        return ApiResponse.success(await this.people.removeSkill(skillId), "Skill removed");
    }

    /* ─── links ──────────────────────────────────────────────── */

    @Post(":id/links")
    async addLink(@Param("id") id: string, @Body() dto: UpsertLinkDto) {
        return ApiResponse.success(await this.people.addLink(id, dto), "Link added");
    }

    @Put("links/:linkId")
    async updateLink(@Param("linkId") linkId: string, @Body() dto: UpsertLinkDto) {
        return ApiResponse.success(await this.people.updateLink(linkId, dto), "Link updated");
    }

    @Delete("links/:linkId")
    async removeLink(@Param("linkId") linkId: string) {
        return ApiResponse.success(await this.people.removeLink(linkId), "Link removed");
    }

    /* ─── ordering ───────────────────────────────────────────── */

    @Patch(":id/reorder/:collection")
    @ApiOperation({ summary: "Reorder a collection — resume section order is meaningful" })
    @ApiParam({ name: "collection", enum: ["projects", "experience", "education", "skills", "links"] })
    async reorder(
        @Param("id") id: string,
        @Param("collection") collection: "projects" | "experience" | "education" | "skills" | "links",
        @Body() dto: ReorderDto
    ) {
        return ApiResponse.success(await this.people.reorder(id, collection, dto), "Order updated");
    }

    /* ─── supporting information ─────────────────────────────── */

    @Get(":id/info-items")
    @ApiOperation({ summary: "List a candidate's attachments and notes" })
    listInfoItems(@Param("id") id: string, @Query() query: ListInfoItemsQueryDto) {
        return this.infoItems.list(id, query);
    }

    @Get("info-items/:itemId")
    @ApiOperation({ summary: "One info item with its extracted text and fact proposals" })
    getInfoItem(@Param("itemId") itemId: string) {
        return this.infoItems.getOne(itemId);
    }

    @Get("info-items/:itemId/download")
    @ApiOperation({ summary: "Time-limited link to the original file" })
    downloadInfoItem(@Param("itemId") itemId: string) {
        return this.infoItems.downloadUrl(itemId);
    }

    @Post(":id/info-items/note")
    @ApiOperation({ summary: "Add a typed note (stored verbatim, no extraction pass)" })
    async addNote(@Param("id") id: string, @Body() dto: CreateNoteDto) {
        return ApiResponse.success(await this.infoItems.createNote(id, dto), "Note added");
    }

    @Post(":id/info-items/upload")
    @UseInterceptors(FileInterceptor("file"))
    @ApiConsumes("multipart/form-data")
    @ApiOperation({ summary: "Upload a PDF, image or text file for this candidate" })
    async uploadInfoItem(
        @Param("id") id: string,
        @Body() dto: UploadInfoItemDto,
        @UploadedFile() file: UploadedFileLike
    ) {
        const item = await this.infoItems.upload(id, file, dto.title);
        return item.extractionStatus === "pending"
            ? ApiResponse.queued(item, "File uploaded — text extraction queued")
            : ApiResponse.success(item, "File uploaded");
    }

    @Delete("info-items/:itemId")
    @ApiOperation({ summary: "Delete an info item and its stored file" })
    async removeInfoItem(@Param("itemId") itemId: string) {
        return ApiResponse.success(await this.infoItems.remove(itemId), "Info item removed");
    }

    @Post("info-items/:itemId/extract")
    @ApiOperation({ summary: "Extract text from one attachment (images are routed to OCR)" })
    async extractInfoItem(@Param("itemId") itemId: string) {
        const item = await this.infoItems.getOne(itemId);

        if (item.kind === "image") {
            const ocr = await this.ocr.run(item);
            return ocr.status === "done"
                ? ApiResponse.success(ocr, `Read ${ocr.chars} characters from the image`)
                : ApiResponse.warning(ocr, ocr.message ?? "OCR produced no text");
        }

        const result = await this.extraction.extractOne(item);
        if (result.status === "failed") return ApiResponse.warning(result, result.message ?? "Extraction failed");
        if (result.status === "needs_ocr") return ApiResponse.warning(result, result.message ?? "Needs OCR");
        return ApiResponse.success(result, `Extracted ${result.chars} characters`);
    }

    @Post(":id/info-items/extract-pending")
    @ApiOperation({ summary: "Extract every pending attachment for this candidate" })
    async extractPending(@Param("id") id: string) {
        // Documents first, then images — OCR is the slow, costly leg.
        const docs = await this.extraction.extractPending(id);
        const images = await this.ocr.runPendingImages(id);
        const results = [...docs, ...images];
        const done = results.filter((r) => r.status === "done").length;
        const failed = results.length - done;
        return ApiResponse.success(
            results,
            failed ? `${done} extracted, ${failed} need attention` : `${done} extracted`
        );
    }

    /* ─── fact review queue ──────────────────────────────────── */

    @Get(":id/facts")
    @ApiOperation({ summary: "Proposed facts awaiting review (status=all for history)" })
    listFacts(@Param("id") id: string, @Query("status") status?: string) {
        return this.facts.list(id, status ?? "pending");
    }

    @Post("info-items/:itemId/propose-facts")
    @ApiOperation({ summary: "Read an attachment and queue the facts it evidences" })
    async proposeFacts(@Param("itemId") itemId: string) {
        const result = await this.facts.generateForItem(itemId);
        const extra = result.discarded ? ` (${result.discarded} malformed discarded)` : "";
        return result.proposed === 0
            ? ApiResponse.info(result, `Nothing new to propose${extra}`)
            : ApiResponse.success(result, `${result.proposed} fact(s) queued for review${extra}`);
    }

    @Post("facts/:factId/accept")
    @ApiOperation({ summary: "Accept a proposed fact and write it into the profile" })
    async acceptFact(@Param("factId") factId: string) {
        return ApiResponse.success(await this.facts.accept(factId), "Fact added to the profile");
    }

    @Post("facts/:factId/reject")
    async rejectFact(@Param("factId") factId: string) {
        return ApiResponse.success(await this.facts.reject(factId), "Proposal rejected");
    }

    @Post(":id/facts/reject-all")
    @ApiOperation({ summary: "Clear the pending queue" })
    async rejectAllFacts(@Param("id") id: string) {
        const result = await this.facts.rejectAll(id);
        return ApiResponse.success(result, `${result.rejected} proposal(s) rejected`);
    }
}
