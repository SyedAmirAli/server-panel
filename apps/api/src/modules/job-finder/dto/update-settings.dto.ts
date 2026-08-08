import { ApiPropertyOptional } from "@nestjs/swagger";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
} from "class-validator";

/** Standard 5- or 6-field cron, matching what @nestjs/schedule accepts. */
const CRON_RE = /^(\S+\s+){4,5}\S+$/;

export class UpdateJobFinderSettingsDto {
    @ApiPropertyOptional({ description: "Run discovery automatically on the schedule below." })
    @IsOptional()
    @IsBoolean()
    cronEnabled?: boolean;

    @ApiPropertyOptional({ description: "Cron expression, e.g. '0 */6 * * *' (every 6 hours).", example: "0 */6 * * *" })
    @IsOptional()
    @IsString()
    @Matches(CRON_RE, { message: "cronExpression must be a 5- or 6-field cron expression" })
    cronExpression?: string;

    @ApiPropertyOptional({ description: "Only keep postings published within this many hours.", default: 24 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(720)
    lookbackHours?: number;

    @ApiPropertyOptional({ description: "Minimum star rating surfaced by default in the list.", default: 3 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5)
    minStars?: number;

    @ApiPropertyOptional({ description: "Cap on postings scored per run (controls model spend).", default: 60 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    maxJobsPerRun?: number;

    @ApiPropertyOptional({ description: "Model used to score postings against the profile." })
    @IsOptional()
    @IsString()
    scoringModel?: string;

    @ApiPropertyOptional({ description: "Model used to draft application emails." })
    @IsOptional()
    @IsString()
    writingModel?: string;

    @ApiPropertyOptional({ description: "Model used to normalize an imported job URL." })
    @IsOptional()
    @IsString()
    extractionModel?: string;

    @ApiPropertyOptional({ description: "Role keywords fanned out to the searchable sources.", type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(25)
    keywords?: string[];

    @ApiPropertyOptional({ description: "Preferred locations. Empty means anywhere.", type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(25)
    locations?: string[];

    @ApiPropertyOptional({ description: "Companies to drop from results.", type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(100)
    excludeCompanies?: string[];

    @ApiPropertyOptional({ description: "Profile used for scoring and drafting." })
    @IsOptional()
    @IsString()
    activeProfileId?: string;
}
