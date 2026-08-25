import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import { CreateScheduleVersionDto, TransitionScheduleVersionDto } from "./schedule-version.dto";
import { ScheduleVersionService } from "./schedule-version.service";

@Controller("schools/:schoolId")
@UseGuards(AuthGuard)
export class ScheduleVersionController {
  constructor(private readonly scheduleVersions: ScheduleVersionService) {}

  @Get("academic-periods/:academicPeriodId/schedule-versions")
  list(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.scheduleVersions.list(schoolId, academicPeriodId);
  }

  @Post("schedule-versions")
  create(@Param("schoolId") schoolId: string, @Body() dto: CreateScheduleVersionDto, @Req() request: RequestWithAuth) {
    return this.scheduleVersions.create(schoolId, request.auth!.userId, dto);
  }

  @Get("schedule-versions/:versionId")
  get(@Param("schoolId") schoolId: string, @Param("versionId") versionId: string) {
    return this.scheduleVersions.get(schoolId, versionId);
  }

  @Post("schedule-versions/:versionId/transitions")
  transition(
    @Param("schoolId") schoolId: string,
    @Param("versionId") versionId: string,
    @Body() dto: TransitionScheduleVersionDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.scheduleVersions.transition(schoolId, versionId, request.auth!.userId, dto);
  }

  @Get("schedule-versions/:versionId/transitions")
  listTransitions(@Param("schoolId") schoolId: string, @Param("versionId") versionId: string) {
    return this.scheduleVersions.listTransitions(schoolId, versionId);
  }
}
