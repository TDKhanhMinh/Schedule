import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { TeacherAvailabilityService } from "./teacher-availability.service";

@Controller("schools")
@UseGuards(AuthGuard)
export class TeacherAvailabilityController {
  constructor(private readonly availability: TeacherAvailabilityService) {}

  @Get(":schoolId/academic-periods/:periodId/teacher-availability")
  listTeacherAvailability(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Query("ruleSnapshotId") ruleSnapshotId: string,
    @Query("teacherId") teacherId?: string,
  ) {
    return this.availability.listTeacherAvailability(schoolId, periodId, ruleSnapshotId, teacherId);
  }
}
