import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { tap } from "rxjs/operators";
import { ObservabilityService } from "./observability.service";

type RequestWithTrace = Request & { requestId?: string };

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithTrace>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.record(request, response.statusCode, startedAt),
        error: (error: unknown) =>
          this.record(request, error instanceof HttpException ? error.getStatus() : 500, startedAt),
      }),
    );
  }

  private record(request: RequestWithTrace, status: number, startedAt: number) {
    this.observability.recordHttp(
      request.method,
      request.route?.path ?? request.path ?? request.url,
      status,
      Date.now() - startedAt,
      request.requestId,
    );
  }
}
