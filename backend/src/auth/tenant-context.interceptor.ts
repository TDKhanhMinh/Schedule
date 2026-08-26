import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { RequestWithAuth } from "./auth.types";
import { tenantContext } from "../database/tenant-context";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const tenantId = request.auth?.tenantId;
    return new Observable((subscriber) => tenantContext.run(tenantId, () => next.handle().subscribe(subscriber)));
  }
}
