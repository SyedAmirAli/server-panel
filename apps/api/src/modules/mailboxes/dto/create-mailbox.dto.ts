import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Transform } from "class-transformer";
import type { MailboxDto as IMailboxDto } from "@appszone/shared";

export class CreateMailboxDto implements IMailboxDto {
    @ApiProperty({ example: "sales@example.com" })
    @IsEmail()
    address: string;

    @ApiPropertyOptional({ example: "Sales Team" })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    displayName?: string;

    @ApiProperty({ example: "imap.gmail.com" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    imapHost: string;

    @ApiPropertyOptional({ example: 993 })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(1)
    @Max(65535)
    imapPort?: number;

    @ApiPropertyOptional({ example: true, description: "true = implicit TLS (usually port 993)" })
    @IsOptional()
    @IsBoolean()
    imapSecure?: boolean;

    @ApiProperty({ example: "sales@example.com" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    imapUser: string;

    @ApiProperty({ description: "Encrypted at rest; never returned by the API" })
    @IsString()
    @IsNotEmpty()
    imapPassword: string;

    @ApiProperty({ example: "smtp.gmail.com" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    smtpHost: string;

    @ApiPropertyOptional({ example: 587 })
    @IsOptional()
    @Transform(({ value }) => (value === "" || value === undefined ? undefined : Number(value)))
    @IsInt()
    @Min(1)
    @Max(65535)
    smtpPort?: number;

    @ApiPropertyOptional({ example: false, description: "true = implicit TLS (port 465); false = STARTTLS (587)" })
    @IsOptional()
    @IsBoolean()
    smtpSecure?: boolean;

    @ApiProperty({ example: "sales@example.com" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    smtpUser: string;

    @ApiProperty({ description: "Encrypted at rest; never returned by the API" })
    @IsString()
    @IsNotEmpty()
    smtpPassword: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
