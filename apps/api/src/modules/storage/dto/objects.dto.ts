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

    @ApiPropertyOptional({ example: "documents/a-copy.png", description: "Optional target key; auto-derived if omitted." })
    @IsOptional()
    @IsString()
    destKey?: string;
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

export class CreateZipDto {
    @ApiPropertyOptional({ example: "documents/students", description: "Folder prefix to zip. Omit/empty = whole bucket." })
    @IsOptional()
    @IsString()
    prefix?: string;
}
