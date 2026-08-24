import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { RequirePermission } from "./auth.decorators";
import { AuthGuard } from "./auth.guard";
import { AuditLogService } from "./audit-log.service";

@Controller("schools/:schoolId/audit-logs")
@UseGuards(AuthGuard)
export class AuditLogController {
  constructor(private readonly auditLogs: AuditLogService) {}

  @Get()
  @RequirePermission("AUDIT_READ")
  list(@Param("schoolId") schoolId: string, @Query("limit") limit?: string) {
    return this.auditLogs.listBySchool(schoolId, limit ? Number(limit) : 100);
  }
}
