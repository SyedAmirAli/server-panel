import { Module } from "@nestjs/common";
import { ApiKeysModule } from "@/modules/api-keys/api-keys.module";
import { MailsController } from "@/modules/mails/mails.controller";
import { MailsService } from "@/modules/mails/mails.service";

@Module({
  imports: [ApiKeysModule], // ApiKeyGuard for /v1/send
  controllers: [MailsController],
  providers: [MailsService],
  // Exported so AI Studio can send applications through the same pipeline.
  exports: [MailsService],
})
export class MailsModule {}
