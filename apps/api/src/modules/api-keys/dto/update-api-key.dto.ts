import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateApiKeyDto {
    @ApiPropertyOptional({
        example: "Sales App",
        maxLength: 120,
        description: "Display name for the API key",
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name?: string;

    @ApiPropertyOptional({
        type: [String],
        example: ["sales@appszonebd.com"],
        description: "If set, the key may only send from these addresses. Pass an empty array to clear restrictions.",
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsEmail({}, { each: true })
    allowedFrom?: string[];
}
