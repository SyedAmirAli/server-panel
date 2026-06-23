import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";
import {
    ATTACHMENT_LIMITS,
    MAIL_BODY_TYPES,
    type MailBodyType,
    type SendMailDto as ISendMailDto,
} from "@appszone/shared";

// multipart/form-data sends every field as a string, so to/cc/bcc may arrive as
// a comma-separated string OR repeated fields (array). Normalize both to string[].
const toEmailArray = ({ value }: { value: unknown }): unknown => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string")
        return value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    return value;
};

export class SendMailDto implements ISendMailDto {
    @ApiProperty({
        format: "email",
        example: "sales@appszonebd.com",
        description:
            "Sender address. Must be a valid email and allowed by the API key's `allowedFrom` list (if configured).",
    })
    @IsEmail()
    from: string;

    @ApiProperty({
        type: [String],
        format: "email",
        minItems: 1,
        maxItems: 50,
        example: ["jon@gmail.com", "doe@gmail.com"],
        description:
            "Primary recipients (required). For `multipart/form-data`, send as repeated fields or a single comma-separated string.",
    })
    @Transform(toEmailArray)
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    @IsEmail({}, { each: true })
    to: string[];

    @ApiPropertyOptional({
        type: [String],
        format: "email",
        maxItems: 50,
        example: ["amir@hubbe.rs"],
        description:
            "Carbon-copy recipients (optional). Same multipart encoding rules as `to`: repeated fields or comma-separated string.",
    })
    @IsOptional()
    @Transform(toEmailArray)
    @IsArray()
    @ArrayMaxSize(50)
    @IsEmail({}, { each: true })
    cc?: string[];

    @ApiPropertyOptional({
        type: [String],
        format: "email",
        maxItems: 50,
        example: ["archive@appszonebd.com"],
        description:
            "Blind carbon-copy recipients (optional). Same multipart encoding rules as `to`: repeated fields or comma-separated string.",
    })
    @IsOptional()
    @Transform(toEmailArray)
    @IsArray()
    @ArrayMaxSize(50)
    @IsEmail({}, { each: true })
    bcc?: string[];

    @ApiProperty({
        example: "Welcome aboard",
        minLength: 1,
        maxLength: 2000,
        description: "Email subject line shown to recipients.",
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    subject: string;

    @ApiProperty({
        enum: MAIL_BODY_TYPES,
        enumName: "MailBodyType",
        example: "PLAIN_TEXT",
        description:
            "How `body` is interpreted. `PLAIN_TEXT` sends a text/plain part; `EMBED_HTML` sends a single text/html part.",
    })
    @IsIn(MAIL_BODY_TYPES)
    bodyType: MailBodyType;

    @ApiProperty({
        example: "Hello there",
        minLength: 1,
        maxLength: 1_000_000,
        description:
            "Message content. Use plain text when `bodyType` is `PLAIN_TEXT`; use a full HTML fragment or document when `bodyType` is `EMBED_HTML`.",
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1_000_000)
    body: string;

    @ApiPropertyOptional({
        type: "array",
        items: { type: "string", format: "binary" },
        maxItems: ATTACHMENT_LIMITS.maxFiles,
        description: `File attachments (multipart/form-data only). Up to ${ATTACHMENT_LIMITS.maxFiles} files, ${ATTACHMENT_LIMITS.maxFileSizeBytes / (1024 * 1024)} MB per file, ${ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)} MB combined.`,
    })
    attachments?: unknown; // handled by multer (@UploadedFiles); not validated here
}
