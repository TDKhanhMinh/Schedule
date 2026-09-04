import { Body, Controller, Get, Headers, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { RequirePermission } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import {
  CreateTeacherAssignmentDemandDto,
  CreateTeacherAssignmentRunDto,
  TeacherAssignmentDecisionDto,
  UpdateTeacherAssignmentDemandDto,
} from "./teacher-assignment.dto";
import { TeacherAssignmentService } from "./teacher-assignment.service";

@Controller("schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs")
@UseGuards(AuthGuard)
export class TeacherAssignmentController {
  constructor(private readonly assignments: TeacherAssignmentService) {}

  @Get("demands")
  @RequirePermission("READ")
  listDemands(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.assignments.listDemands(schoolId, periodId);
  }

  @Post("demands")
  @RequirePermission("WRITE")
  createDemand(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: CreateTeacherAssignmentDemandDto,
  ) {
    return this.assignments.createDemand(schoolId, periodId, dto);
  }

  @Put("demands/:demandId")
  @RequirePermission("WRITE")
  updateDemand(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("demandId") demandId: string,
    @Body() dto: UpdateTeacherAssignmentDemandDto,
  ) {
    return this.assignments.updateDemand(schoolId, periodId, demandId, dto);
  }

  @Post("demands/:demandId/archive")
  @RequirePermission("WRITE")
  archiveDemand(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("demandId") demandId: string,
  ) {
    return this.assignments.archiveDemand(schoolId, periodId, demandId);
  }

  @Post("preflight")
  @RequirePermission("READ")
  preflight(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.assignments.preflight(schoolId, periodId);
  }

  @Post()
  @RequirePermission("SOLVE")
  enqueue(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: CreateTeacherAssignmentRunDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.assignments.enqueue(
      schoolId,
      periodId,
      dto,
      request.auth!.userId,
      request.auth!.tenantId,
      request.requestId,
    );
  }

  @Get(":runId")
  @RequirePermission("READ")
  getStatus(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string, @Param("runId") runId: string) {
    return this.assignments.getStatus(schoolId, periodId, runId);
  }

  @Post(":runId/cancel")
  @RequirePermission("SOLVE")
  cancel(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("runId") runId: string,
    @Body() dto: TeacherAssignmentDecisionDto,
  ) {
    return this.assignments.cancel(schoolId, periodId, runId, dto.reason);
  }

  @Post(":runId/retry")
  @RequirePermission("SOLVE")
  retry(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("runId") runId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth,
  ) {
    return this.assignments.retry(
      schoolId,
      periodId,
      runId,
      request.auth!.userId,
      request.auth!.tenantId,
      idempotencyKey,
    );
  }

  @Post(":runId/confirm")
  @RequirePermission("WRITE")
  confirm(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("runId") runId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth,
  ) {
    return this.assignments.confirm(
      schoolId,
      periodId,
      runId,
      request.auth!.userId,
      request.auth!.role,
      idempotencyKey,
    );
  }

  @Post(":runId/reject")
  @RequirePermission("WRITE")
  reject(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("runId") runId: string,
    @Body() dto: TeacherAssignmentDecisionDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.assignments.reject(schoolId, periodId, runId, request.auth!.userId, request.auth!.role, dto.reason);
  }
}
