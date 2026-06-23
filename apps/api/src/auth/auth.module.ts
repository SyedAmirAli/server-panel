import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "@/auth/auth.controller";
import { AuthService } from "@/auth/auth.service";
import { AdminGuard } from "@/auth/admin.guard";

@Module({
  // Secret + expiry are passed per-call from ConfigService, so register empty.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AdminGuard, JwtModule],
})
export class AuthModule {}
