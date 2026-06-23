import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HttpLoggerMiddleware } from "@/common/http-logger.middleware";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "node:path";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";
import { ApiKeysModule } from "@/modules/api-keys/api-keys.module";
import { MailsModule } from "@/modules/mails/mails.module";
import { EmailConfigsModule } from "@/modules/email-configs/email-configs.module";
import { HealthController } from "@/health.controller";
import { UtilityModule } from './modules/utility/utility.module';

const isProd = process.env.NODE_ENV === "production";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ApiKeysModule,
    MailsModule,
    EmailConfigsModule,
    // Production: serve the built SPA (apps/web/dist) from the API itself.
    // API routes are excluded so they reach their controllers; everything else
    // falls back to index.html for client-side routing.
    // Dev: SPA is proxied to the Vite dev server in main.ts instead.
    ...(isProd
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, "..", "..", "web", "dist"),
            exclude: ["/api/(.*)", "/swagger", "/swagger/(.*)"],
          }),
        ]
      : []),
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
