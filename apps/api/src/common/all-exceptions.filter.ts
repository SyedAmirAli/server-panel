import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { MulterError } from "multer";
import { ATTACHMENT_LIMITS } from "@appszone/shared";

/** Maps every thrown error to the standard { status:"error", message, data } envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let httpStatus: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let data: unknown = null;

    if (exception instanceof MulterError) {
      httpStatus = HttpStatus.PAYLOAD_TOO_LARGE;
      message =
        exception.code === "LIMIT_FILE_SIZE"
          ? `Attachment exceeds the per-file size limit (${ATTACHMENT_LIMITS.maxFileSizeBytes} bytes)`
          : exception.code === "LIMIT_FILE_COUNT"
            ? `Too many attachments (max ${ATTACHMENT_LIMITS.maxFiles})`
            : exception.message;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const m = (body as { message?: unknown }).message;
        if (Array.isArray(m)) {
          message = String(m[0] ?? "Validation failed");
          data = { errors: m }; // full list of validation issues
        } else if (typeof m === "string") {
          message = m;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (httpStatus >= 500) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }

    res.status(httpStatus).json({ status: "error", message, data });
  }
}
