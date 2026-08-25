import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isRole, ROLE_PERMISSIONS, type Permission } from "./auth.constants";
import { REQUIRED_PERMISSION } from "./auth.decorators";
import type { RequestWithAuth } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const userId = this.header(request, "x-user-id");
    const roleValue = this.header(request, "x-user-role").toUpperCase();
    const schoolId = this.header(request, "x-school-id");

    if (!userId || !roleValue || !schoolId) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "Yêu cầu x-user-id, x-user-role và x-school-id để truy cập API nghiệp vụ.",
      });
    }
    if (!isRole(roleValue)) {
      throw new ForbiddenException({ code: "ROLE_INVALID", message: "Role không được hỗ trợ." });
    }

    const requestedSchoolId = this.requestSchoolId(request);
    if (requestedSchoolId && requestedSchoolId !== schoolId) {
      throw new ForbiddenException({
        code: "SCHOOL_SCOPE_FORBIDDEN",
        message: "Không được truy cập school scope khác.",
      });
    }

    const permission =
      this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]) ??
      this.inferPermission(request);
    const permissions = ROLE_PERMISSIONS[roleValue];
    if (!permissions.includes(permission)) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: `Role ${roleValue} không có quyền ${permission}.`,
        permission,
      });
    }

    request.auth = { userId, role: roleValue, schoolId, permissions };
    return true;
  }

  private requestSchoolId(request: RequestWithAuth) {
    const params = request.params as Record<string, string | undefined>;
    const body = request.body as Record<string, unknown> | undefined;
    const bodySchoolId = typeof body?.schoolId === "string" ? body.schoolId : undefined;
    return params.schoolId ?? bodySchoolId;
  }

  private inferPermission(request: RequestWithAuth): Permission {
    const path = `${request.baseUrl ?? ""}${request.path ?? request.url}`.toLowerCase();
    if (path.includes("/audit")) return "AUDIT_READ";
    if (path.includes("/imports")) return request.method === "GET" ? "READ" : "IMPORT";
    if (path.includes("/optimization-jobs")) return request.method === "POST" ? "SOLVE" : "READ";
    if (request.method === "POST" && path.includes("/schedule-versions/") && path.includes("/transitions")) {
      const targetStatus = request.body && typeof request.body.toStatus === "string" ? request.body.toStatus : "";
      return ["APPROVED", "PUBLISHED", "ARCHIVED"].includes(targetStatus) ? "PUBLISH" : "WRITE";
    }
    if (path.includes("/publish")) return "PUBLISH";
    if (request.method === "GET" || request.method === "HEAD") return "READ";
    return "WRITE";
  }

  private header(request: RequestWithAuth, name: string) {
    return request.header(name)?.trim() ?? "";
  }
}
