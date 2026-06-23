import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";
import type { AdminLoginDto as IAdminLoginDto } from "@appszone/shared";

export class AdminLoginDto implements IAdminLoginDto {
  @ApiProperty({ example: "12345678", description: "Admin password (matched against ADMIN_PASSWORD)" })
  @IsString()
  @IsNotEmpty()
  password: string;
}
