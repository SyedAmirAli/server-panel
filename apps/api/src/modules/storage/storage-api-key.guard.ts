import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
    createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import type { StorageApiKey } from "@prisma/client";
import { StorageKeysService } from "@/modules/storage/storage-keys.service";
import { isIpAllowed, isOriginAllowed, resolveClientIp, resolveOrigin } from "@/modules/storage/storage-scope.util";

/** Validates `Authorization: Bearer <storage key>` + origin/IP allowlists for /storage/* routes. */
@Injectable()
export class StorageApiKeyGuard implements CanActivate {
    constructor(private readonly keys: StorageKeysService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<Request & { storageApiKey?: StorageApiKey }>();
        const [scheme, token] = (req.headers.authorization ?? "").split(" ");

        if (scheme !== "Bearer" || !token) {
            throw new UnauthorizedException("Missing storage API key");
        }

        const key = await this.keys.findActiveBySecret(token);
        if (!key) throw new UnauthorizedException("Invalid, inactive, or expired storage API key");

        const origin = resolveOrigin(req);
        if (!isOriginAllowed(origin, (key.allowedOrigins as string[]) ?? [])) {
            throw new ForbiddenException(`Origin not allowed for this key${origin ? `: ${origin}` : ""}`);
        }

        const ip = resolveClientIp(req);
        if (!isIpAllowed(ip, (key.allowedIps as string[]) ?? [])) {
            throw new ForbiddenException(`Client IP not allowed for this key: ${ip}`);
        }

        this.keys.touch(key.id);
        req.storageApiKey = key;
        return true;
    }
}

/** `@CurrentStorageKey()` — injects the authenticated StorageApiKey into a handler. */
export const CurrentStorageKey = createParamDecorator((_data, ctx: ExecutionContext): StorageApiKey => {
    const req = ctx.switchToHttp().getRequest<Request & { storageApiKey: StorageApiKey }>();
    return req.storageApiKey;
});
