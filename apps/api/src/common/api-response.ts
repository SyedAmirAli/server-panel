import type { ApiStatus } from "@appszone/shared";

/**
 * Envelope for mutating responses (POST/PUT/PATCH/DELETE). Return an instance
 * from a handler to control `status`/`message`; otherwise the global interceptor
 * wraps the raw return value as a generic success. GET/HEAD are never wrapped.
 */
export class ApiResponse<T = unknown> {
    constructor(
        public readonly status: ApiStatus,
        public readonly message: string,
        public readonly data: T = null as T
    ) {}

    static success<T>(data: T, message = "Success"): ApiResponse<T> {
        return new ApiResponse("success", message, data);
    }
    static queued<T>(data: T, message = "Queued"): ApiResponse<T> {
        return new ApiResponse("queued", message, data);
    }
    static info<T>(data: T, message = "Info"): ApiResponse<T> {
        return new ApiResponse("info", message, data);
    }
    static warning<T>(data: T, message = "Warning"): ApiResponse<T> {
        return new ApiResponse("warning", message, data);
    }
    static error<T>(data: T, message = "Error"): ApiResponse<T> {
        return new ApiResponse("error", message, data);
    }
}
