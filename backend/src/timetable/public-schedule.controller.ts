import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { RequirePermission } from "../auth/auth.decorators";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import { CreatePublicScheduleLinkDto, PublicScheduleQueryDto } from "./public-schedule.dto";
import { PublicScheduleService } from "./public-schedule.service";

@Controller()
export class PublicScheduleController {
  constructor(private readonly publicSchedules: PublicScheduleService) {}

  @Get("public/schedules/:token.pdf")
  async pdf(@Param("token") token: string, @Query() query: PublicScheduleQueryDto, @Res() response: Response) {
    const result = await this.publicSchedules.buildPdf(token, query.view ?? "all", query.resource);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
    response.setHeader("X-Public-View-Contract-Version", result.metadata.contractVersion);
    response.send(result.buffer);
  }

  @Get("public/schedules/:token")
  view(@Param("token") token: string, @Query() query: PublicScheduleQueryDto) {
    return this.publicSchedules.getPublicView(token, query.view ?? "all", query.resource);
  }

  @Post("schools/:schoolId/schedule-versions/:versionId/public-links")
  @UseGuards(AuthGuard)
  @RequirePermission("PUBLISH")
  createLink(
    @Param("schoolId") schoolId: string,
    @Param("versionId") versionId: string,
    @Body() dto: CreatePublicScheduleLinkDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.publicSchedules.createLink(schoolId, versionId, request.auth!.userId, dto.expiresInHours);
  }

  @Post("schools/:schoolId/schedule-versions/:versionId/public-links/:linkId/revoke")
  @UseGuards(AuthGuard)
  @RequirePermission("PUBLISH")
  revokeLink(
    @Param("schoolId") schoolId: string,
    @Param("versionId") versionId: string,
    @Param("linkId") linkId: string,
  ) {
    return this.publicSchedules.revokeLink(schoolId, versionId, linkId);
  }
}
