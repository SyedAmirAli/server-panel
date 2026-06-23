import {
    Body,
    Controller,
    Headers as NestHeaders,
    Post,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ATTACHMENT_LIMITS } from "@appszone/shared";
import type { ApiKey } from "@prisma/client";
import { ApiKeyGuard, CurrentApiKey } from "@/modules/api-keys/api-key.guard";
import { MailsService, type UploadedAttachment } from "@/modules/mails/mails.service";
import { SendMailDto } from "@/modules/mails/dto/send-mail.dto";
import { ApiResponse } from "@/common/api-response";

@ApiTags("Mail")
@ApiBearerAuth("apikey")
@Controller("mails")
export class MailsController {
    constructor(private readonly mails: MailsService) {}

    @Post("send")
    @UseGuards(ApiKeyGuard)
    @UseInterceptors(
        FilesInterceptor("attachments", ATTACHMENT_LIMITS.maxFiles, {
            limits: { fileSize: ATTACHMENT_LIMITS.maxFileSizeBytes, files: ATTACHMENT_LIMITS.maxFiles },
        })
    )
    @ApiOperation({ summary: "Queue an email for delivery" })
    @ApiConsumes("application/json", "multipart/form-data")
    @ApiBody({ type: SendMailDto })
    async send(
        @CurrentApiKey() apiKey: ApiKey,
        @Body() dto: SendMailDto,
        @UploadedFiles() files?: UploadedAttachment[],
        @NestHeaders() headers?: any
    ) {
        const view = await this.mails.send(apiKey, dto, files ?? [], headers);

        if (view.status === "failed") return ApiResponse.warning(view, `Send failed: ${view.error}`);
        if (view.status === "sent") return ApiResponse.success(view, "Email sent");
        return ApiResponse.queued(view, "Email queued for delivery");
    }
}
