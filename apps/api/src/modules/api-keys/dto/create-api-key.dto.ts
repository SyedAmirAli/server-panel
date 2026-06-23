import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateApiKeyDto {
    @ApiProperty({ example: "Sales App", maxLength: 120 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name: string;

    @ApiPropertyOptional({
        type: [String],
        example: ["sales@appszonebd.com"],
        description: "If set, the key may only send from these addresses",
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsEmail({}, { each: true })
    allowedFrom?: string[];
}
