import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

/** Query for listing/browsing objects (admin live browse + public list). */
export class ListObjectsQueryDto {
    @ApiPropertyOptional({ example: "A1B2C3D4E5F6", description: "Bucket publicId (required for public API; admin uses the route param)." })
    @IsOptional()
    @IsString()
    bucketId?: string;

    @ApiPropertyOptional({ example: "documents/students", description: "Folder prefix to browse." })
    @IsOptional()
    @IsString()
    prefix?: string;

    @ApiPropertyOptional({ example: "db", enum: ["live", "db"], description: "live = read from bucket; db = only API-uploaded records." })
    @IsOptional()
    @IsString()
    source?: "live" | "db";

    @ApiPropertyOptional({ description: "Continuation token for live listings." })
    @IsOptional()
    @IsString()
    token?: string;

    @ApiPropertyOptional({ example: 100 })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(1)
    @Max(1000)
    limit?: number;
}

export class DeleteObjectsDto {
    @ApiPropertyOptional({ example: "A1B2C3D4E5F6" })
    @IsOptional()
    @IsString()
    bucketId?: string;

    @ApiPropertyOptional({ type: [String], example: ["documents/a.png", "documents/b.png"] })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(1000)
    @IsString({ each: true })
    keys: string[];
}

export class CopyObjectDto {
    @ApiPropertyOptional({ example: "A1B2C3D4E5F6" })
    @IsOptional()
    @IsString()
    bucketId?: string;

    @ApiPropertyOptional({ example: "documents/a.png" })
    @IsString()
    sourceKey: string;

    @ApiPropertyOptional({
        example: "documents/students",
        description: "Destination folder, root-relative. Omit to copy into the source object's own folder.",
    })
    @IsOptional()
    @IsString()
    destPrefix?: string;

    @ApiPropertyOptional({ example: "renamed-file", description: "New base filename (extension is derived automatically). Omit to keep the source name (with a '-copy' suffix)." })
    @IsOptional()
    @IsString()
    newName?: string;

    @ApiPropertyOptional({ description: "Convert the copy to WebP (images only; ignored for non-images)." })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : value === true || value === "true"))
    convertToWebp?: boolean;

    @ApiPropertyOptional({ example: 80 })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(1)
    @Max(100)
    quality?: number;
}

export class PresignQueryDto {
    @ApiPropertyOptional({ example: "A1B2C3D4E5F6" })
    @IsOptional()
    @IsString()
    bucketId?: string;

    @ApiPropertyOptional({ example: "documents/a.png" })
    @IsString()
    key: string;

    @ApiPropertyOptional({ example: 3600 })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(60)
    @Max(604800)
    expiresIn?: number;
}

export class LockPathDto {
    @ApiPropertyOptional({ example: "documents/students", description: "Folder prefix to delete-protect." })
    @IsString()
    prefix: string;
}

export class UnlockPathDto {
    @ApiPropertyOptional({ example: "documents/students" })
    @IsString()
    prefix: string;

    @ApiPropertyOptional({ description: "Admin password, re-entered to confirm removing delete-protection." })
    @IsString()
    password: string;
}

export class CreateFileDto {
    @ApiPropertyOptional({ example: "documents/students", description: "Destination folder. Omit for bucket root." })
    @IsOptional()
    @IsString()
    prefix?: string;

    @ApiPropertyOptional({ example: "My Notes (draft).txt", description: "Exact file name, verbatim — not slugified." })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: "Initial text content. Omit/blank for a zero-byte file." })
    @IsOptional()
    @IsString()
    content?: string;
}

export class CreateZipDto {
    @ApiPropertyOptional({ example: "documents/students", description: "Folder prefix to zip. Omit/empty = whole bucket." })
    @IsOptional()
    @IsString()
    prefix?: string;
}
