import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** A typed note — stored verbatim, no upload, no extraction pass. */
export class CreateNoteDto {
    @IsOptional()
    @IsString()
    @MaxLength(191)
    title?: string;

    @IsString()
    @IsNotEmpty()
    text!: string;
}

/** Metadata accompanying a multipart upload. */
export class UploadInfoItemDto {
    @IsOptional()
    @IsString()
    @MaxLength(191)
    title?: string;

    /**
     * Optional override. Normally inferred from the file's MIME type — trusting
     * a client-supplied kind would let a PDF be processed as an image.
     */
    @IsOptional()
    @IsIn(["pdf", "image", "textfile"])
    kind?: "pdf" | "image" | "textfile";
}

export class ListInfoItemsQueryDto {
    @IsOptional()
    @IsIn(["pdf", "image", "textfile", "note"])
    kind?: string;

    @IsOptional()
    @IsIn(["pending", "done", "failed", "skipped"])
    status?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    offset?: number;
}
