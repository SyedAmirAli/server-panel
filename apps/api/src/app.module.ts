import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { join } from "node:path";
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
import { AiStudioModule } from "@/modules/ai-studio/ai-studio.module";
import { HealthController } from "@/health.controller";
import { UtilityModule } from './modules/utility/utility.module';

// The monorepo keeps a single .env at the repo root, shared with the web app and
// with docker. Resolve it from this file's location rather than the cwd, which
// differs between `nest start` (apps/api) and the container (/app): compiled
// output sits at <root>/apps/api/dist, so the root is three levels up.
const ROOT_ENV_FILE = join(__dirname, "..", "..", "..", ".env");

@Module({
  imports: [
    // envFilePath is a fallback list, not a merge — the process environment
    // still wins, so compose/`docker run -e` overrides continue to work and the
    // container needs no .env file on disk.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ROOT_ENV_FILE }),
    ScheduleModule.forRoot(), // powers MailSyncService's @Interval IMAP sync
    PrismaModule,
    AuthModule,
    ApiKeysModule,
    MailsModule,
    EmailConfigsModule,
    StorageModule,
    MailboxesModule,
    JobFinderModule,
    AiStudioModule,
    UtilityModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggerMiddleware).forRoutes("*");
    }
}
