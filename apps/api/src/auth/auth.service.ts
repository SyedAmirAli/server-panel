import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { timingSafeEqual } from "node:crypto";
import type { AdminLoginResponse } from "@appszone/shared";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AuthService {
    constructor(
        private readonly config: ConfigService,
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService
    ) {}

    async login(password: string, headers?: any): Promise<AdminLoginResponse> {
        const expected = this.config.get<string>("ADMIN_PASSWORD") ?? "";
        const ip = headers?.["x-forwarded-for"] ?? headers?.["cf-connecting-ip"] ?? headers?.["x-real-ip"] ?? null;
        const userAgent = headers?.["user-agent"] ?? null;

        const commonAuditLogData = {
            ip,
            userAgent,
            actorType: "admin",
            actorId: "admin",
            entityType: "AuditLog",
            entityId: "admin",
            metadata: { password: password, expected: "********" },
        };

        if (!expected || !this.safeEqual(password, expected)) {
            // create a audit log for the failed login
            await this.prisma.auditLog.create({
                data: {
                    ...commonAuditLogData,
                    action: "admin.login.failed",
                    message: `Invalid password for admin login from ${ip} with user agent ${userAgent}`,
                },
            });

            throw new UnauthorizedException("Invalid password");
        }

        const expiresIn = this.config.get<string>("JWT_EXPIRES_IN") ?? "24h";
        const token = await this.jwt.signAsync(
            { sub: "admin", role: "admin" },
            { secret: this.config.get<string>("JWT_SECRET"), expiresIn }
        );

        // create a audit log for the successful login
        await this.prisma.auditLog.create({
            data: {
                ...commonAuditLogData,
                action: "admin.login.success",
                metadata: { token, expiresIn },
                message: `Admin login successful from ${ip} with user agent ${userAgent}`,
            },
        });

        return { token, expiresIn };
    }

    /** Constant-time string compare (avoids leaking length-independent timing). */
    private safeEqual(a: string, b: string): boolean {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return timingSafeEqual(ab, bb);
    }
}
