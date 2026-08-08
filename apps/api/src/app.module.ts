import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HttpLoggerMiddleware } from "@/common/http-logger.middleware";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";
import { ApiKeysModule } from "@/modules/api-keys/api-keys.module";
import { MailsModule } from "@/modules/mails/mails.module";
import { EmailConfigsModule } from "@/modules/email-configs/email-configs.module";
import { StorageModule } from "@/modules/storage/storage.module";
import { MailboxesModule } from "@/modules/mailboxes/mailboxes.module";
import { JobFinderModule } from "@/modules/job-finder/job-finder.module";
import { HealthController } from "@/health.controller";
import { UtilityModule } from './modules/utility/utility.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // powers MailSyncService's @Interval IMAP sync
    PrismaModule,
    AuthModule,
    ApiKeysModule,
    MailsModule,
    EmailConfigsModule,
    StorageModule,
    MailboxesModule,
    JobFinderModule,
    UtilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggerMiddleware).forRoutes("*");
    }
}
