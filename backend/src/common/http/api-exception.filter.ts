import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";

type ExceptionResponse = string | object;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalized = this.normalizeResponse(exceptionResponse, statusCode);

    response.status(statusCode).json({
      statusCode,
      code: normalized.code,
      message: normalized.message,
      requestId: request.requestId ?? "unknown",
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      ...(normalized.details ? { details: normalized.details } : {}),
    });
  }

  private normalizeResponse(response: ExceptionResponse | undefined, statusCode: number) {
    if (typeof response === "string") {
      return { code: this.defaultCode(statusCode), message: response };
    }

    if (response && typeof response === "object") {
      const payload = response as Record<string, unknown>;
      const message = payload.message;
      return {
        code: typeof payload.code === "string" ? payload.code : this.defaultCode(statusCode),
        message: Array.isArray(message) ? message.join(", ") : typeof message === "string" ? message : "Request failed",
        details: payload,
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại.",
    };
  }

  private defaultCode(statusCode: number) {
    if (statusCode === HttpStatus.BAD_REQUEST) return "BAD_REQUEST";
    if (statusCode === HttpStatus.NOT_FOUND) return "NOT_FOUND";
    if (statusCode === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
    if (statusCode === HttpStatus.FORBIDDEN) return "FORBIDDEN";
    return statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR";
  }
}
