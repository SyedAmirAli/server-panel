import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Coerce multipart string fields ("true"/"1") into booleans. */
const toBool = ({ value }: { value: unknown }): unknown => {
    if (typeof value === "boolean") return value;
    if (value === undefined || value === null || value === "") return undefined;
    return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

export class UploadDto {
    @ApiPropertyOptional({ example: "A1B2C3D4E5F6", description: "Target bucket publicId. Omit to use the key's default bucket." })
    @IsOptional()
    @IsString()
    bucketId?: string;

    @ApiPropertyOptional({ example: "documents/students", description: "Folder path (S3 key prefix)." })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    prefix?: string;

    @ApiPropertyOptional({
        example: "documents/photos/sub/img.png",
        description:
            "Exact object key for a raw/folder upload. When set, the file is stored verbatim " +
            "(no slugify, no image processing, overwrites if it exists). Overrides prefix.",
    })
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    keyPath?: string;

    @ApiPropertyOptional({ example: true, description: "Store as a private object (default: true). Returns a presigned URL." })
    @IsOptional()
    @IsString()
    // Kept as a raw string: global enableImplicitConversion would coerce the
    // multipart "false" into boolean `true`. The service coerces it explicitly.
    private?: string;

    @ApiPropertyOptional({ example: 3600, description: "Presigned URL lifetime in seconds (private objects)." })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(60)
    @Max(604800)
    expiresIn?: number;

    @ApiPropertyOptional({ example: true, description: "Convert images to WebP." })
    @IsOptional()
    @Transform(toBool)
    convertToWebp?: boolean;

    @ApiPropertyOptional({ example: true, description: "Compress images." })
    @IsOptional()
    @Transform(toBool)
    compress?: boolean;

    @ApiPropertyOptional({ example: 80, description: "Image quality 1–100 (used when compress/convert is on)." })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(1)
    @Max(100)
    quality?: number;
}
