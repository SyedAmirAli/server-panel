import { ApiPropertyOptional } from "@nestjs/swagger";
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

export class UpdateEmailConfigDto {
    @ApiPropertyOptional({ example: "Mailcow SMTP", maxLength: 255 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string;

    @ApiPropertyOptional({ example: "mail.appszonebd.com", maxLength: 255 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    host?: string;

    @ApiPropertyOptional({ example: 587, minimum: 1, maximum: 65535 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(65535)
    port?: number;

    @ApiPropertyOptional({ example: "noreply@appszonebd.com", maxLength: 255 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    username?: string;

    @ApiPropertyOptional({ example: "smtp-secret", maxLength: 255 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    password?: string;

    @ApiPropertyOptional({ type: EmailConfigTlsDto, nullable: true })
    @IsOptional()
    @ValidateNested()
    @Type(() => EmailConfigTlsDto)
    tls?: EmailConfigTlsDto | null;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    requireTLS?: boolean;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    secure?: boolean;
}
