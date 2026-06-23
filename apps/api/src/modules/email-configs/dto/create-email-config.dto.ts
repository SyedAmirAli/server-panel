import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";
import { EmailConfigTlsDto } from "@/modules/email-configs/dto/email-config-tls.dto";

export class CreateEmailConfigDto {
    @ApiProperty({ example: "Mailcow SMTP", maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @ApiProperty({ example: "mail.appszonebd.com", maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    host: string;

    @ApiProperty({ example: 587, minimum: 1, maximum: 65535, default: 587 })
    @IsInt()
    @Min(1)
    @Max(65535)
    port: number;

    @ApiProperty({ example: "noreply@appszonebd.com", maxLength: 255 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    username: string;

    @ApiProperty({ example: "smtp-secret", maxLength: 255, description: "SMTP password (never returned in API responses)" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    password: string;

    @ApiPropertyOptional({ type: EmailConfigTlsDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => EmailConfigTlsDto)
    tls?: EmailConfigTlsDto;

    @ApiPropertyOptional({ example: false, default: false })
    @IsOptional()
    @IsBoolean()
    requireTLS?: boolean;

    @ApiPropertyOptional({ example: false, default: false, description: "Use TLS from connection start (port 465)" })
    @IsOptional()
    @IsBoolean()
    secure?: boolean;
}
