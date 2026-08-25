import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { mergeMap } from "rxjs/operators";
import { AuditLogService, type AuditAction } from "./audit-log.service";
import type { RequestWithAuth } from "./auth.types";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLogs: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next.handle();

    const path = `${request.baseUrl ?? ""}${request.path ?? request.url}`;
    if (path.endsWith("/imports/preview")) return next.handle();
    if (path.includes("/schedule-versions/") && path.includes("/assignments/")) return next.handle();

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const auth = request.auth;
        if (!auth) return result;
        await this.auditMutation(request, path, result, auth);
        return result;
      }),
    );
  }

  private async auditMutation(
    request: RequestWithAuth,
    path: string,
    result: unknown,
    auth: NonNullable<RequestWithAuth["auth"]>,
  ) {
    const action = this.actionFor(request.method, path);
    const entityType = this.entityTypeFor(path);
    const resultRecord =
      result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
    if (path.toLowerCase().includes("/imports") && resultRecord.auditLog) return;
    const entityId = this.stringValue(resultRecord.id ?? resultRecord.importBatchId ?? resultRecord.jobId);
    await this.auditLogs.record({
      schoolId: auth.schoolId,
      action,
      entityType,
      entityId,
      actorId: auth.userId,
      actorRole: auth.role,
      correlationId: request.requestId ?? "unknown",
      metadata: { method: request.method, route: path },
    });
  }

  private actionFor(method: string, path: string): AuditAction {
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes("/imports")) return "IMPORT";
    if (lowerPath.includes("/optimization-jobs")) return "SOLVE";
    if (lowerPath.includes("/publish")) return "PUBLISH";
    if (method === "POST") return "CREATE";
    if (method === "PATCH" || method === "PUT") return "UPDATE";
    return "DELETE";
  }

  private entityTypeFor(path: string) {
    const lowerPath = path.toLowerCase();
    const mappings: Array<[string, string]> = [
      ["/lesson-requirements", "lesson_requirement"],
      ["/time-slots", "time_slot"],
      ["/academic-periods", "academic_period"],
      ["/teachers", "teacher"],
      ["/classes", "class"],
      ["/subjects", "subject"],
      ["/rooms", "room"],
      ["/imports", "import_batch"],
      ["/optimization-jobs", "optimization_job"],
      ["/publish", "schedule"],
    ];
    return mappings.find(([prefix]) => lowerPath.includes(prefix))?.[1] ?? "http_resource";
  }

  private stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
  }
}
