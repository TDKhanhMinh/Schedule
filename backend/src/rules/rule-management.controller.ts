import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { RequirePermission } from "../auth/auth.decorators";
import type { RequestWithAuth } from "../auth/auth.types";
import {
  ApproveRuleSnapshotDto,
  CreateRuleDefinitionDto,
  CreateRuleProfileDto,
  ResolveRuleSnapshotQueryDto,
  UpdateRuleDefinitionDto,
  UpdateRuleProfileDto,
} from "./rule-management.dto";
import { RuleManagementService } from "./rule-management.service";

@Controller("schools/:schoolId")
@UseGuards(AuthGuard)
export class RuleManagementController {
  constructor(private readonly rules: RuleManagementService) {}

  @Get("rule-catalog")
  @RequirePermission("READ")
  catalog() {
    return this.rules.getCatalog();
  }

  @Get("academic-periods/:academicPeriodId/rule-profiles")
  @RequirePermission("READ")
  listProfiles(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.rules.listProfiles(schoolId, academicPeriodId);
  }

  @Post("academic-periods/:academicPeriodId/rule-profiles")
  @RequirePermission("WRITE")
  createProfile(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Body() dto: CreateRuleProfileDto,
  ) {
    return this.rules.createProfile(schoolId, academicPeriodId, dto);
  }

  @Post("academic-periods/:academicPeriodId/rule-profiles/ensure-draft")
  @RequirePermission("WRITE")
  ensureDraftProfile(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.rules.ensureDraftProfileForPeriod(schoolId, academicPeriodId);
  }

  @Get("rule-profiles/:profileId")
  @RequirePermission("READ")
  getProfile(@Param("schoolId") schoolId: string, @Param("profileId") profileId: string) {
    return this.rules.getProfile(schoolId, profileId);
  }

  @Patch("rule-profiles/:profileId")
  @RequirePermission("WRITE")
  updateProfile(
    @Param("schoolId") schoolId: string,
    @Param("profileId") profileId: string,
    @Body() dto: UpdateRuleProfileDto,
  ) {
    return this.rules.updateProfile(schoolId, profileId, dto);
  }

  @Post("rule-profiles/:profileId/rules")
  @RequirePermission("WRITE")
  createRule(
    @Param("schoolId") schoolId: string,
    @Param("profileId") profileId: string,
    @Body() dto: CreateRuleDefinitionDto,
  ) {
    return this.rules.createRule(schoolId, profileId, dto);
  }

  @Patch("rule-profiles/:profileId/rules/:ruleId")
  @RequirePermission("WRITE")
  updateRule(
    @Param("schoolId") schoolId: string,
    @Param("profileId") profileId: string,
    @Param("ruleId") ruleId: string,
    @Body() dto: UpdateRuleDefinitionDto,
  ) {
    return this.rules.updateRule(schoolId, profileId, ruleId, dto);
  }

  @Delete("rule-profiles/:profileId/rules/:ruleId")
  @RequirePermission("WRITE")
  deleteRule(
    @Param("schoolId") schoolId: string,
    @Param("profileId") profileId: string,
    @Param("ruleId") ruleId: string,
  ) {
    return this.rules.deleteRule(schoolId, profileId, ruleId);
  }

  @Get("rule-profiles/:profileId/validation")
  @RequirePermission("READ")
  validateProfile(@Param("schoolId") schoolId: string, @Param("profileId") profileId: string) {
    return this.rules.validateProfile(schoolId, profileId);
  }

  @Post("rule-profiles/:profileId/snapshots")
  @RequirePermission("WRITE")
  createSnapshot(
    @Param("schoolId") schoolId: string,
    @Param("profileId") profileId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.rules.createSnapshot(schoolId, profileId, request.auth!.userId);
  }

  @Get("academic-periods/:academicPeriodId/rule-snapshots")
  @RequirePermission("READ")
  listSnapshots(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.rules.listSnapshots(schoolId, academicPeriodId);
  }

  @Get("academic-periods/:academicPeriodId/rule-snapshots/active")
  @RequirePermission("READ")
  resolveActiveSnapshot(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Query() query: ResolveRuleSnapshotQueryDto,
  ) {
    return this.rules.resolveActiveSnapshot(schoolId, academicPeriodId, query.asOf);
  }

  @Get("rule-snapshots/:snapshotId")
  @RequirePermission("READ")
  getSnapshot(@Param("schoolId") schoolId: string, @Param("snapshotId") snapshotId: string) {
    return this.rules.getSnapshot(schoolId, snapshotId);
  }

  @Post("rule-snapshots/:snapshotId/approve")
  @RequirePermission("PUBLISH")
  approveSnapshot(
    @Param("schoolId") schoolId: string,
    @Param("snapshotId") snapshotId: string,
    @Body() dto: ApproveRuleSnapshotDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.rules.approveSnapshot(schoolId, snapshotId, request.auth!.userId, request.auth!.role, dto);
  }
}
