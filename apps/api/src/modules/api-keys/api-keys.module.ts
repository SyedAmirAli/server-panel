import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { ApiKeysService } from "@/modules/api-keys/api-keys.service";
import { ApiKeyGuard } from "@/modules/api-keys/api-key.guard";
import { KeysController } from "@/modules/api-keys/keys.controller";

@Module({
  imports: [AuthModule], // AdminGuard for the admin key endpoints
  controllers: [KeysController],
  providers: [ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
