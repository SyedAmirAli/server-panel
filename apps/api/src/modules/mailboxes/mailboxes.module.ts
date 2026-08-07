import { Module } from "@nestjs/common";
import { AuthModule } from "@/auth/auth.module";
import { MailboxesService } from "@/modules/mailboxes/mailboxes.service";
import { MailSyncService } from "@/modules/mailboxes/mail-sync.service";
import { MailboxesAdminController } from "@/modules/mailboxes/mailboxes.admin.controller";

@Module({
    imports: [AuthModule], // AdminGuard for admin routes
    controllers: [MailboxesAdminController],
    providers: [MailboxesService, MailSyncService],
    exports: [MailboxesService],
})
export class MailboxesModule {}
