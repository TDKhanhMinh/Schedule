import { Body, Controller, Get, Headers, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import { CreateScheduleVersionDto, TransitionScheduleVersionDto } from "./schedule-version.dto";
import { UpdateScheduleAssignmentDto } from "./schedule-edit.dto";
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
  async get(
    @Param("schoolId") schoolId: string,
    @Param("versionId") versionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const snapshot = await this.scheduleVersions.getSnapshot(schoolId, versionId);
    response.setHeader("ETag", snapshot.etag);
    return snapshot;
  }

  @Patch("schedule-versions/:versionId/assignments/:lessonId/:sessionIndex")
  async updateAssignment(
    @Param("schoolId") schoolId: string,
    @Param("versionId") versionId: string,
    @Param("lessonId") lessonId: string,
    @Param("sessionIndex") sessionIndex: string,
    @Body() dto: UpdateScheduleAssignmentDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: RequestWithAuth,
    @Res({ passthrough: true }) response: Response,
  ) {
    const snapshot = await this.scheduleVersions.updateAssignment(
      schoolId,
      versionId,
      lessonId,
      Number(sessionIndex),
      request.auth!.userId,
      dto,
      ifMatch,
    );
    response.setHeader("ETag", snapshot.etag);
    return snapshot;
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
