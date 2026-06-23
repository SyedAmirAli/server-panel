import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import type { ApiKey } from "@prisma/client";
import { ApiKeysService } from "@/modules/api-keys/api-keys.service";

/** Validates the `Authorization: Bearer <api key>` header for /v1/* routes. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiKey?: ApiKey }>();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Missing API key");
    }

    const key = await this.apiKeys.findActiveBySecret(token);
    if (!key) throw new UnauthorizedException("Invalid or inactive API key");

    this.apiKeys.touch(key.id);
    req.apiKey = key;
    return true;
  }
}

/** `@CurrentApiKey()` — injects the authenticated ApiKey into a handler. */
export const CurrentApiKey = createParamDecorator((_data, ctx: ExecutionContext): ApiKey => {
  const req = ctx.switchToHttp().getRequest<Request & { apiKey: ApiKey }>();
  return req.apiKey;
});
