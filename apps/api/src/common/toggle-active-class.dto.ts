import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

/** Shared body for PATCH `.../toggle-active` endpoints. Omit `isActive` to flip the current state. */
export class ToggleActiveClassDto {
    @ApiPropertyOptional({
        example: true,
        type: Boolean,
        description:
            "Set the active state explicitly (`true` to enable, `false` to disable). Omit this field to toggle the current value.",
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
