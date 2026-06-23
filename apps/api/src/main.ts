import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "@/app.module";
import { ResponseEnvelopeInterceptor } from "@/common/response-envelope.interceptor";
import { AllExceptionsFilter } from "@/common/all-exceptions.filter";
import { PrismaService } from "@/prisma/prisma.service";
import { printStartupBanner } from "@/shared/utils/startup-banner";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as { version: string };

const isProd = process.env.NODE_ENV === "production";

// All API routes live under /api/v1 (global prefix); Swagger under /swagger.
// Everything else is the SPA (proxied to Vite in dev, served from dist in prod).
const API_PREFIXES = ["/api", "/swagger"];
const isApiPath = (path: string) => API_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

async function bootstrap() {
    // Disable the default 100kb body parser; multipart is handled by multer,
    // and JSON bodies (EMBED_HTML up to ~1MB) need a larger limit.
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    app.use(json({ limit: "5mb" }));
    app.use(urlencoded({ extended: true, limit: "5mb" }));

    // Global prefix: every controller route is served under /api/v1.
    app.setGlobalPrefix("api/v1");

    // class-validator DTOs: transform payloads to DTO instances and strip
    // unknown properties across every endpoint.
    app.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true, transformOptions: { enableImplicitConversion: true } }),
    );

    // Standard response envelope (mutating methods) + error envelope.
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    app.enableCors({
        origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
        credentials: true,
    });

    // Swagger / OpenAPI docs at /swagger (JSON at /swagger/json).
    const swaggerConfig = new DocumentBuilder()
        .setTitle("AppsZone Mail API")
        .setDescription("Send mail, manage API keys, and admin operations")
        .setVersion("1.0")
        .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "admin")
        .addBearerAuth({ type: "http", scheme: "bearer", description: "azm_live_… API key" }, "apikey")
        .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("swagger", app, document, { jsonDocumentUrl: "swagger/json" });

    // Dev: proxy all non-API requests (SPA assets + HMR websocket) to Vite.
    if (!isProd) {
        const target = process.env.WEB_DEV_SERVER_URL ?? "http://localhost:5173";
        const spaProxy = createProxyMiddleware({
            target,
            changeOrigin: true,
            ws: true,
            pathFilter: (path) => !isApiPath(path),
        });
        app.use(spaProxy);
        // Forward HMR websocket upgrades to Vite.
        app.getHttpServer().on("upgrade", (spaProxy as unknown as { upgrade: Function }).upgrade);
        Logger.log(`Proxying SPA → ${target}`, "Bootstrap");
    }

    const port = Number(process.env.API_PORT ?? 3000);
    await app.listen(port);

    const base = `http://localhost:${port}`;
    const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",");
    const dbConnected = await pingDb(app.get(PrismaService));

    printStartupBanner({
        name: "AppsZone Mail",
        version: pkg.version,
        env: process.env.NODE_ENV ?? "development",
        url: `${base}/api/v1`,
        docs: `${base}/swagger`,
        health: `${base}/api/v1/health`,
        dbConnected,
        corsOrigins,
        routes: [
            "POST   /api/v1/admin/login",
            "GET    /api/v1/admin/keys                  (list)",
            "POST   /api/v1/admin/keys                  (create)",
            "PUT    /api/v1/admin/keys/:id              (update)",
            "PATCH  /api/v1/admin/keys/:id/toggle-active",
            "POST   /api/v1/admin/keys/:id/refresh",
            "DELETE /api/v1/admin/keys/:id",
            "GET    /api/v1/admin/email-configs         (list)",
            "POST   /api/v1/admin/email-configs         (create)",
            "PUT    /api/v1/admin/email-configs/:id     (update)",
            "PATCH  /api/v1/admin/email-configs/:id/toggle-active",
            "DELETE /api/v1/admin/email-configs/:id",
            "POST   /api/v1/mails/send",
            "GET    /api/v1/utility/audit-log",
            "GET    /api/v1/utility/sent-messages",
            "GET    /api/v1/utility/mailboxes",
            "GET    /api/v1/utility/mail-messages",
            "GET    /api/v1/health",
        ],
    });
}

async function pingDb(prisma: PrismaService): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

bootstrap();
