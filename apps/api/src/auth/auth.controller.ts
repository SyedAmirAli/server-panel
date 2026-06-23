import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "@/auth/auth.service";
import { AdminLoginDto } from "@/auth/dto/admin-login.dto";
import { ApiResponse } from "@/common/api-response";

@ApiTags("Admin")
@Controller("admin")
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post("login")
    @HttpCode(200)
    @ApiOperation({ summary: "Authenticate admin, returns a JWT" })
    async login(@Body() dto: AdminLoginDto, @Headers() headers: any) {
        const result = await this.auth.login(dto.password, headers);
        return ApiResponse.success(result, "Logged in");
    }
}
