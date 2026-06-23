import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { Request } from "express";
import { ApiResponse } from "@/common/api-response";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_MESSAGE: Record<string, string> = {
  POST: "Created",
  PUT: "Updated",
  PATCH: "Updated",
  DELETE: "Deleted",
};

/**
 * Wraps mutating responses in { status, message, data }. GET/HEAD pass through
 * untouched. Handlers may return an ApiResponse to set status/message explicitly.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = context.switchToHttp().getRequest<Request>().method.toUpperCase();

    return next.handle().pipe(
      map((payload) => {
        if (!MUTATING.has(method)) return payload; // GET/HEAD → raw data

        if (payload instanceof ApiResponse) {
          return { status: payload.status, message: payload.message, data: payload.data ?? null };
        }
        return { status: "success", message: DEFAULT_MESSAGE[method] ?? "Success", data: payload ?? null };
      }),
    );
  }
}
