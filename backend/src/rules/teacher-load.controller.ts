import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { TeacherLoadService } from "./teacher-load.service";

@Controller("schools")
@UseGuards(AuthGuard)
export class TeacherLoadController {
  constructor(private readonly teacherLoad: TeacherLoadService) {}

  @Get(":schoolId/academic-periods/:periodId/teacher-loads")
  listTeacherLoads(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Query("ruleSnapshotId") ruleSnapshotId: string,
  ) {
    return this.teacherLoad.listTeacherLoads(schoolId, periodId, ruleSnapshotId);
  }
}
