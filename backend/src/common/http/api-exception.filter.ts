import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";
import { createConflictDiagnostic, getConflictDefinition } from "../../contracts/conflict-catalog";

type ExceptionResponse = string | object;
type NormalizedResponse = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  catalogVersion?: string;
  remediationHint?: string;
  entity?: string;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const uploadErrorCode = this.uploadErrorCode(exception);
    const statusCode = uploadErrorCode
      ? HttpStatus.BAD_REQUEST
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalized = uploadErrorCode
      ? {
          details: { code: uploadErrorCode },
          ...createConflictDiagnostic(
            uploadErrorCode,
            uploadErrorCode === "FILE_TOO_LARGE"
              ? "File Excel vượt quá kích thước cho phép."
              : "Upload file Excel không hợp lệ.",
          ),
        }
      : this.normalizeResponse(exceptionResponse, statusCode);

    response.status(statusCode).json({
      statusCode,
      code: normalized.code,
      message: normalized.message,
      requestId: request.requestId ?? "unknown",
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      ...(normalized.details ? { details: normalized.details } : {}),
      ...(normalized.catalogVersion
        ? {
            catalogVersion: normalized.catalogVersion,
            remediationHint: normalized.remediationHint,
            entity: normalized.entity,
          }
        : {}),
    });
  }

  private normalizeResponse(response: ExceptionResponse | undefined, statusCode: number): NormalizedResponse {
    if (typeof response === "string") {
      return { code: this.defaultCode(statusCode), message: response };
    }

    if (response && typeof response === "object") {
      const payload = response as Record<string, unknown>;
      const message = payload.message;
      const code = typeof payload.code === "string" ? payload.code : this.defaultCode(statusCode);
      const safeMessage = Array.isArray(message)
        ? message.join(", ")
        : typeof message === "string"
          ? message
          : "Request failed";
      const diagnostic = getConflictDefinition(code) ? createConflictDiagnostic(code, safeMessage) : undefined;
      return {
        code,
        message: safeMessage,
        details: this.sanitizeDetails(payload),
        ...(diagnostic
          ? {
              catalogVersion: diagnostic.catalogVersion,
              remediationHint: diagnostic.remediationHint,
              entity: diagnostic.entity,
            }
          : {}),
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại.",
    };
  }

  private sanitizeDetails(payload: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(payload).filter(([key]) => !["stack", "stackTrace", "cause"].includes(key)),
    );
  }

  private defaultCode(statusCode: number) {
    if (statusCode === HttpStatus.BAD_REQUEST) return "BAD_REQUEST";
    if (statusCode === HttpStatus.NOT_FOUND) return "NOT_FOUND";
    if (statusCode === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
    if (statusCode === HttpStatus.FORBIDDEN) return "FORBIDDEN";
    return statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR";
  }

  private uploadErrorCode(exception: unknown) {
    if (!exception || typeof exception !== "object") return undefined;
    const code = (exception as { code?: unknown }).code;
    if (code === "LIMIT_FILE_SIZE") return "FILE_TOO_LARGE";
    if (typeof code === "string" && code.startsWith("LIMIT_")) return "INVALID_FILE_UPLOAD";
    return undefined;
  }
}
