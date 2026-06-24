import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HttpLoggerMiddleware } from "@/common/http-logger.middleware";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";
import { ApiKeysModule } from "@/modules/api-keys/api-keys.module";
import { MailsModule } from "@/modules/mails/mails.module";
import { EmailConfigsModule } from "@/modules/email-configs/email-configs.module";
import { HealthController } from "@/health.controller";
import { UtilityModule } from './modules/utility/utility.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ApiKeysModule,
    MailsModule,
    EmailConfigsModule,
    UtilityModule,
    // Phase 2+: AuthModule, KeysModule, MailModule, AdminModule, QueueModule
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggerMiddleware).forRoutes("*");
    }
}
