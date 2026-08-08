import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ImportProfileDto {
    @ApiPropertyOptional({
        description:
            "Resume repo directory or a single resume file. Defaults to RESUME_SOURCE_PATH. Read-only — the source is never written to.",
        example: "/home/user/projects/resume",
    })
    @IsOptional()
    @IsString()
    path?: string;

    @ApiPropertyOptional({
        description: "Re-normalize even when the source content hash is unchanged.",
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    force?: boolean;
}
