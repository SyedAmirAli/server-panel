import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches } from "class-validator";
import type { DashboardPresetPeriod } from "@appszone/shared";

const PERIODS: DashboardPresetPeriod[] = ["today", "week", "month", "year", "all"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardQueryDto {
    @ApiPropertyOptional({
        enum: PERIODS,
        default: "month",
        description: "Preset window. Ignored when both fromDate and toDate are set.",
    })
    @IsOptional()
    @IsIn(PERIODS)
    period?: DashboardPresetPeriod;

    @ApiPropertyOptional({
        default: 0,
        description: "Shift the preset window: 0 = current, -1 = previous, +1 = next. Ignored for `all`.",
        example: 0,
    })
    @IsOptional()
    @Transform(({ value }) => (value === undefined || value === "" ? 0 : Number(value)))
    @IsInt()
    offset?: number;

    @ApiPropertyOptional({
        example: "2026-06-01",
        description: "Custom range start (YYYY-MM-DD, UTC). Requires toDate.",
    })
    @IsOptional()
    @IsString()
    @Matches(ISO_DATE, { message: "fromDate must be YYYY-MM-DD" })
    fromDate?: string;

    @ApiPropertyOptional({
        example: "2026-06-30",
        description: "Custom range end (YYYY-MM-DD, UTC). Requires fromDate.",
    })
    @IsOptional()
    @IsString()
    @Matches(ISO_DATE, { message: "toDate must be YYYY-MM-DD" })
    toDate?: string;
}
