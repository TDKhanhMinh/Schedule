import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { AuthGuard } from "./auth.guard";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditLogController } from "./audit-log.controller";
import { AuditLogService } from "./audit-log.service";

/** Authentication and school-scope authorization boundary for the next increment. */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuditLogController],
  providers: [AuthGuard, AuditLogService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuthGuard, AuditLogService],
})
export class AuthModule {}
