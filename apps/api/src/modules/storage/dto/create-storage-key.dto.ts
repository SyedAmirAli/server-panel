import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { CreateStorageKeyDto as ICreateStorageKeyDto } from "@appszone/shared";

export class CreateStorageKeyDto implements ICreateStorageKeyDto {
    @ApiProperty({ example: "Mobile App Uploader", maxLength: 120 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @ApiPropertyOptional({
        type: [String],
        example: ["A1B2C3D4E5F6"],
        description: "Bucket publicIds this key may use. Empty = all buckets.",
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    allowedBuckets?: string[];

    @ApiPropertyOptional({ example: "A1B2C3D4E5F6", description: "Default bucket when a request omits bucketId" })
    @IsOptional()
    @IsString()
    defaultBucketId?: string | null;

    @ApiPropertyOptional({ type: [String], example: ["https://app.example.com"], description: "Allowed origins. Empty = any." })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    allowedOrigins?: string[];

    @ApiPropertyOptional({ type: [String], example: ["203.0.113.4"], description: "Allowed client IPs/CIDRs. Empty = any." })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    allowedIps?: string[];

    @ApiPropertyOptional({ example: "2027-01-01T00:00:00.000Z", description: "Expiry ISO date. Omit = never." })
    @IsOptional()
    @IsDateString()
    expiresAt?: string | null;
}
