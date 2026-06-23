import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

// Paths logged at debug level only (avoids spamming the log with health polls).
const QUIET_PATHS = new Set(["/api/v1/health", "/health"]);

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger("HTTP");

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl } = req;
        const start = Date.now();

        res.on("finish", () => {
            const ms = Date.now() - start;
            const { statusCode } = res;
            const contentLength = res.get("content-length");

            const statusColor =
                statusCode >= 500 ? "\x1b[31m" :   // red
                statusCode >= 400 ? "\x1b[33m" :   // yellow
                statusCode >= 300 ? "\x1b[36m" :   // cyan
                                    "\x1b[32m";     // green

            const methodColor =
                method === "GET"    ? "\x1b[36m" :  // cyan
                method === "POST"   ? "\x1b[32m" :  // green
                method === "PUT"    ? "\x1b[33m" :  // yellow
                method === "PATCH"  ? "\x1b[33m" :  // yellow
                method === "DELETE" ? "\x1b[31m" :  // red
                                      "\x1b[37m";   // white

            const reset = "\x1b[0m";
            const dim   = "\x1b[2m";

            const size = contentLength ? ` ${dim}${contentLength}B${reset}` : "";
            const line = `${methodColor}${method.padEnd(6)}${reset} ${originalUrl} ${statusColor}${statusCode}${reset} ${dim}${ms}ms${reset}${size}`;

            // Keep health-check noise at debug so it stays invisible in production.
            if (QUIET_PATHS.has(originalUrl)) {
                this.logger.debug(line);
            } else {
                this.logger.log(line);
            }
        });

        next();
    }
}
