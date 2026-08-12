import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import { JOB_POSTING_STATUSES } from "@/modules/job-finder/dto/list-postings.dto";

export const JOB_APPLICATION_STATUSES = ["draft", "ready", "sent", "replied", "rejected"] as const;

export class ImportJobUrlDto {
    @ApiProperty({ description: "Public job posting URL to fetch and normalize.", example: "https://example.com/jobs/123" })
    @IsUrl({ require_protocol: true }, { message: "url must be a full http(s) URL" })
    url!: string;
}

export class UpdatePostingStatusDto {
    @ApiProperty({ enum: JOB_POSTING_STATUSES })
    @IsIn(JOB_POSTING_STATUSES as unknown as string[])
    status!: string;
}

export class UpdateApplicationDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(500)
    subject?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    body?: string;

    @ApiPropertyOptional({ description: "Recipient address for the application." })
    @IsOptional()
    @IsEmail()
    toEmail?: string;

    @ApiPropertyOptional({ enum: JOB_APPLICATION_STATUSES })
    @IsOptional()
    @IsIn(JOB_APPLICATION_STATUSES as unknown as string[])
    status?: string;
}

export class MarkApplicationSentDto {
    @ApiPropertyOptional({ description: "SentMessage id, when the mail went out through this app." })
    @IsOptional()
    @IsString()
    sentMessageId?: string;
}

export class UpdateJobSourceDto {
    @ApiPropertyOptional({ description: "Enable or disable this source for runs." })
    @IsOptional()
    isActive?: boolean;

    @ApiPropertyOptional({ description: "Adapter-specific configuration.", type: Object })
    @IsOptional()
    config?: Record<string, unknown>;
}
