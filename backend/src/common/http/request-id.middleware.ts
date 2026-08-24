import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Injectable, type NestMiddleware } from "@nestjs/common";

export type RequestWithId = Request & { requestId: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction) {
    const incoming = request.header("x-request-id");
    const requestId = this.isSafeRequestId(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  }

  private isSafeRequestId(value: string | undefined): value is string {
    return Boolean(value && value.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(value));
  }
}
