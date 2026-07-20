import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

/**
 * Admin guard variant for SSE endpoints. Browser `EventSource` cannot send an
 * Authorization header, so this also accepts the admin JWT via `?token=`.
 */
@Injectable()
export class AdminSseGuard implements CanActivate {
    constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<Request>();
        const header = req.headers.authorization ?? "";
        const [scheme, headerToken] = header.split(" ");
        const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
        const token = scheme === "Bearer" && headerToken ? headerToken : queryToken;

        if (!token) throw new UnauthorizedException("Missing admin token");

        try {
            const payload = await this.jwt.verifyAsync(token, { secret: this.config.get<string>("JWT_SECRET") });
            if (payload.role !== "admin") throw new Error("not admin");
            return true;
        } catch {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }
}
