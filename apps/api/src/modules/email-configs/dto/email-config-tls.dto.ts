import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class EmailConfigTlsDto {
    @ApiPropertyOptional({
        example: true,
        description: "When false, allows self-signed TLS certificates (nodemailer `tls.rejectUnauthorized`).",
    })
    @IsOptional()
    @IsBoolean()
    rejectUnauthorized?: boolean;
}
