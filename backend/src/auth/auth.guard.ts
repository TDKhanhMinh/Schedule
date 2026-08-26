import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { isRole, ROLE_PERMISSIONS, type Permission } from "./auth.constants";
import { REQUIRED_PERMISSION } from "./auth.decorators";
import type { RequestWithAuth } from "./auth.types";
import { assertTenantId, assertTenantScope, TenantScopeViolation } from "./tenant-scope";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext) {
    if (this.config.get<string>("NODE_ENV", "development") === "production") {
      throw new ServiceUnavailableException({
        code: "AUTH_PROVIDER_REQUIRED",
        message: "Production identity provider chưa được cấu hình; local identity headers đã bị vô hiệu hóa.",
      });
    }
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const userId = this.header(request, "x-user-id");
    const roleValue = this.header(request, "x-user-role").toUpperCase();
    const schoolId = this.header(request, "x-school-id");
    const tenantIdHeader = this.header(request, "x-tenant-id");

    if (!userId || !roleValue || !schoolId) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "Yêu cầu x-user-id, x-user-role và x-school-id để truy cập API nghiệp vụ.",
      });
    }
    if (!isRole(roleValue)) {
      throw new ForbiddenException({ code: "ROLE_INVALID", message: "Role không được hỗ trợ." });
    }

    let tenantId: string | undefined;
    try {
      tenantId = tenantIdHeader ? assertTenantId(tenantIdHeader) : undefined;
      assertTenantScope(tenantId, this.requestTenantId(request));
    } catch (error) {
      if (error instanceof TenantScopeViolation) {
        throw new ForbiddenException({ code: error.code, message: error.message });
      }
      throw error;
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

    request.auth = { userId, role: roleValue, schoolId, tenantId, permissions };
    return true;
  }

  private requestSchoolId(request: RequestWithAuth) {
    const params = request.params as Record<string, string | undefined>;
    const body = request.body as Record<string, unknown> | undefined;
    const bodySchoolId = typeof body?.schoolId === "string" ? body.schoolId : undefined;
    return params.schoolId ?? bodySchoolId;
  }

  private requestTenantId(request: RequestWithAuth) {
    const params = request.params as Record<string, string | undefined>;
    const body = request.body as Record<string, unknown> | undefined;
    const bodyTenantId = typeof body?.tenantId === "string" ? body.tenantId : undefined;
    return params.tenantId ?? bodyTenantId;
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
