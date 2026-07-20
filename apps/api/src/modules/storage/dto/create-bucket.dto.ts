import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import { STORAGE_PROVIDERS, type CreateBucketDto as ICreateBucketDto, type StorageProvider } from "@appszone/shared";

export class CreateBucketDto implements ICreateBucketDto {
    @ApiProperty({ example: "Student Documents" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @ApiProperty({ enum: STORAGE_PROVIDERS, example: "r2" })
    @IsIn(STORAGE_PROVIDERS as unknown as string[])
    provider: StorageProvider;

    @ApiPropertyOptional({ example: "https://<accountid>.r2.cloudflarestorage.com" })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    endpoint?: string;

    @ApiPropertyOptional({ example: "auto" })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    region?: string;

    @ApiProperty({ example: "my-bucket" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    bucketName: string;

    @ApiPropertyOptional({ example: true, description: "Use path-style URLs (required by R2/MinIO)" })
    @IsOptional()
    @IsBoolean()
    forcePathStyle?: boolean;

    @ApiProperty({ example: "AKIA..." })
    @IsString()
    @IsNotEmpty()
    accessKeyId: string;

    @ApiProperty({ example: "secret..." })
    @IsString()
    @IsNotEmpty()
    secretAccessKey: string;

    @ApiPropertyOptional({ example: "https://cdn.example.com", description: "Public base URL/CDN for public objects" })
    @IsOptional()
    @IsUrl({ require_tld: false })
    publicBaseUrl?: string;
}
