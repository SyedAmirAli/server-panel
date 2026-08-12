import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";

export const JOB_POSTING_STATUSES = ["new", "scored", "shortlisted", "applied", "dismissed", "archived"] as const;

export class ListPostingsQueryDto {
    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 25, maximum: 100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiPropertyOptional({ description: "Only postings rated at least this many stars.", minimum: 1, maximum: 5 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(5)
    minStars?: number;

    @ApiPropertyOptional({
        enum: JOB_POSTING_STATUSES,
        description: "Defaults to everything except dismissed and archived.",
    })
    @IsOptional()
    @IsIn(JOB_POSTING_STATUSES as unknown as string[])
    status?: string;

    @ApiPropertyOptional({ description: "Filter to one source." })
    @IsOptional()
    @IsString()
    sourceId?: string;

    @ApiPropertyOptional({ description: "Only remote (true) or only on-site (false)." })
    @IsOptional()
    @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value))
    @IsBoolean()
    isRemote?: boolean;

    @ApiPropertyOptional({ description: "Only postings published at or after this ISO timestamp." })
    @IsOptional()
    @IsISO8601()
    since?: string;

    @ApiPropertyOptional({ description: "Free-text match on title, company or location." })
    @IsOptional()
    @IsString()
    search?: string;
}
