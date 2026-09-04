import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { RequestWithAuth } from "../auth/auth.types";
import {
  AssignHomeroomTeacherDto,
  AssignTeacherSubjectGradeDto,
  CreateAcademicPeriodDto,
  CreateClassDto,
  CreateLessonRequirementDto,
  CreateRoomDto,
  CreateSchoolDto,
  CreateSubjectDto,
  CreateTeacherDto,
  CreateTimeSlotDto,
  UpsertGradeShiftConfigsDto,
  UpdateAcademicPeriodDto,
  UpdateAcademicPeriodStatusDto,
  UpdateClassDto,
  UpdateLessonRequirementDto,
  UpdateRoomDto,
  UpdateSchoolDto,
  UpdateSubjectDto,
  UpdateTeacherDto,
  UpdateTimeSlotDto,
} from "./master-data.dto";
import { MasterDataService } from "./master-data.service";

@Controller("schools")
@UseGuards(AuthGuard)
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get("context")
  getContext(@Req() request: RequestWithAuth) {
    return this.masterData
      .getWorkspaceContext(request.auth!.userId, request.auth!.schoolId, request.auth!.tenantId, request.auth!.role)
      .then((context) => ({ ...context, role: request.auth!.role }));
  }

  @Get()
  listSchools(@Req() request: RequestWithAuth) {
    return this.masterData.listSchools(request.auth!.schoolId, request.auth!.tenantId);
  }

  @Post()
  createSchool(@Body() dto: CreateSchoolDto, @Req() request: RequestWithAuth) {
    return this.masterData.createSchool(dto, request.auth?.tenantId, request.auth?.schoolId);
  }

  @Get(":schoolId")
  getSchool(@Param("schoolId") schoolId: string) {
    return this.masterData.getSchool(schoolId);
  }

  @Patch(":schoolId")
  updateSchool(@Param("schoolId") schoolId: string, @Body() dto: UpdateSchoolDto) {
    return this.masterData.updateSchool(schoolId, dto);
  }

  @Delete(":schoolId")
  archiveSchool(@Param("schoolId") schoolId: string) {
    return this.masterData.archiveSchool(schoolId);
  }

  @Get(":schoolId/teachers")
  listTeachers(@Param("schoolId") schoolId: string) {
    return this.masterData.listTeachers(schoolId);
  }

  @Post(":schoolId/teachers")
  createTeacher(@Param("schoolId") schoolId: string, @Body() dto: CreateTeacherDto) {
    return this.masterData.createTeacher(schoolId, dto);
  }

  @Get(":schoolId/teachers/:teacherId")
  getTeacher(@Param("schoolId") schoolId: string, @Param("teacherId") teacherId: string) {
    return this.masterData.getTeacher(schoolId, teacherId);
  }

  @Patch(":schoolId/teachers/:teacherId")
  updateTeacher(
    @Param("schoolId") schoolId: string,
    @Param("teacherId") teacherId: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.masterData.updateTeacher(schoolId, teacherId, dto);
  }

  @Delete(":schoolId/teachers/:teacherId")
  archiveTeacher(@Param("schoolId") schoolId: string, @Param("teacherId") teacherId: string) {
    return this.masterData.archiveTeacher(schoolId, teacherId);
  }

  @Get(":schoolId/classes")
  listClasses(@Param("schoolId") schoolId: string) {
    return this.masterData.listClasses(schoolId);
  }

  @Get(":schoolId/academic-periods/:academicPeriodId/homeroom-assignments")
  listHomeroomAssignments(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.masterData.listHomeroomAssignments(schoolId, academicPeriodId);
  }

  @Get(":schoolId/academic-periods/:academicPeriodId/teacher-subject-grade-assignments")
  listTeacherSubjectGradeAssignments(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
  ) {
    return this.masterData.listTeacherSubjectGradeAssignments(schoolId, academicPeriodId);
  }

  @Post(":schoolId/academic-periods/:academicPeriodId/teacher-subject-grade-assignments")
  assignTeacherSubjectGrade(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Body() dto: AssignTeacherSubjectGradeDto,
  ) {
    return this.masterData.assignTeacherSubjectGrade(schoolId, academicPeriodId, dto);
  }

  @Delete(":schoolId/academic-periods/:academicPeriodId/teacher-subject-grade-assignments/:assignmentId")
  archiveTeacherSubjectGrade(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Param("assignmentId") assignmentId: string,
  ) {
    return this.masterData.archiveTeacherSubjectGrade(schoolId, academicPeriodId, assignmentId);
  }

  @Get(":schoolId/academic-periods/:academicPeriodId/teacher-subject-grade-coverage")
  getTeacherSubjectGradeCoverage(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
  ) {
    return this.masterData.getTeacherSubjectGradeCoverage(schoolId, academicPeriodId);
  }

  @Get(":schoolId/academic-periods/:academicPeriodId/teacher-load-summary")
  getTeacherLoadSummary(@Param("schoolId") schoolId: string, @Param("academicPeriodId") academicPeriodId: string) {
    return this.masterData.getTeacherLoadSummary(schoolId, academicPeriodId);
  }

  @Put(":schoolId/academic-periods/:academicPeriodId/classes/:classId/homeroom")
  assignHomeroomTeacher(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Param("classId") classId: string,
    @Body() dto: AssignHomeroomTeacherDto,
  ) {
    return this.masterData.assignHomeroomTeacher(schoolId, academicPeriodId, classId, dto);
  }

  @Delete(":schoolId/academic-periods/:academicPeriodId/classes/:classId/homeroom")
  removeHomeroomTeacher(
    @Param("schoolId") schoolId: string,
    @Param("academicPeriodId") academicPeriodId: string,
    @Param("classId") classId: string,
  ) {
    return this.masterData.removeHomeroomTeacher(schoolId, academicPeriodId, classId);
  }

  @Post(":schoolId/classes")
  createClass(@Param("schoolId") schoolId: string, @Body() dto: CreateClassDto) {
    return this.masterData.createClass(schoolId, dto);
  }

  @Get(":schoolId/classes/:classId")
  getClass(@Param("schoolId") schoolId: string, @Param("classId") classId: string) {
    return this.masterData.getClass(schoolId, classId);
  }

  @Patch(":schoolId/classes/:classId")
  updateClass(@Param("schoolId") schoolId: string, @Param("classId") classId: string, @Body() dto: UpdateClassDto) {
    return this.masterData.updateClass(schoolId, classId, dto);
  }

  @Delete(":schoolId/classes/:classId")
  archiveClass(@Param("schoolId") schoolId: string, @Param("classId") classId: string) {
    return this.masterData.archiveClass(schoolId, classId);
  }

  @Get(":schoolId/subjects")
  listSubjects(@Param("schoolId") schoolId: string) {
    return this.masterData.listSubjects(schoolId);
  }

  @Post(":schoolId/subjects")
  createSubject(@Param("schoolId") schoolId: string, @Body() dto: CreateSubjectDto) {
    return this.masterData.createSubject(schoolId, dto);
  }

  @Get(":schoolId/subjects/:subjectId")
  getSubject(@Param("schoolId") schoolId: string, @Param("subjectId") subjectId: string) {
    return this.masterData.getSubject(schoolId, subjectId);
  }

  @Patch(":schoolId/subjects/:subjectId")
  updateSubject(
    @Param("schoolId") schoolId: string,
    @Param("subjectId") subjectId: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.masterData.updateSubject(schoolId, subjectId, dto);
  }

  @Delete(":schoolId/subjects/:subjectId")
  archiveSubject(@Param("schoolId") schoolId: string, @Param("subjectId") subjectId: string) {
    return this.masterData.archiveSubject(schoolId, subjectId);
  }

  @Get(":schoolId/rooms")
  listRooms(@Param("schoolId") schoolId: string) {
    return this.masterData.listRooms(schoolId);
  }

  @Post(":schoolId/rooms")
  createRoom(@Param("schoolId") schoolId: string, @Body() dto: CreateRoomDto) {
    return this.masterData.createRoom(schoolId, dto);
  }

  @Get(":schoolId/rooms/:roomId")
  getRoom(@Param("schoolId") schoolId: string, @Param("roomId") roomId: string) {
    return this.masterData.getRoom(schoolId, roomId);
  }

  @Patch(":schoolId/rooms/:roomId")
  updateRoom(@Param("schoolId") schoolId: string, @Param("roomId") roomId: string, @Body() dto: UpdateRoomDto) {
    return this.masterData.updateRoom(schoolId, roomId, dto);
  }

  @Delete(":schoolId/rooms/:roomId")
  archiveRoom(@Param("schoolId") schoolId: string, @Param("roomId") roomId: string) {
    return this.masterData.archiveRoom(schoolId, roomId);
  }

  @Get(":schoolId/academic-periods")
  listAcademicPeriods(@Param("schoolId") schoolId: string) {
    return this.masterData.listAcademicPeriods(schoolId);
  }

  @Post(":schoolId/academic-periods")
  createAcademicPeriod(@Param("schoolId") schoolId: string, @Body() dto: CreateAcademicPeriodDto) {
    return this.masterData.createAcademicPeriod(schoolId, dto);
  }

  @Get(":schoolId/academic-periods/:periodId")
  getAcademicPeriod(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.masterData.getAcademicPeriod(schoolId, periodId);
  }

  @Patch(":schoolId/academic-periods/:periodId")
  updateAcademicPeriod(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: UpdateAcademicPeriodDto,
  ) {
    return this.masterData.updateAcademicPeriod(schoolId, periodId, dto);
  }

  @Patch(":schoolId/academic-periods/:periodId/status")
  updateAcademicPeriodStatus(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: UpdateAcademicPeriodStatusDto,
  ) {
    return this.masterData.updateAcademicPeriodStatus(schoolId, periodId, dto.status);
  }

  @Delete(":schoolId/academic-periods/:periodId")
  archiveAcademicPeriod(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.masterData.archiveAcademicPeriod(schoolId, periodId);
  }

  @Get(":schoolId/academic-periods/:periodId/time-slots")
  listTimeSlots(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.masterData.listTimeSlots(schoolId, periodId);
  }

  @Post(":schoolId/academic-periods/:periodId/time-slots")
  createTimeSlot(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: CreateTimeSlotDto,
  ) {
    return this.masterData.createTimeSlot(schoolId, periodId, dto);
  }

  @Patch(":schoolId/academic-periods/:periodId/time-slots/:slotId")
  updateTimeSlot(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("slotId") slotId: string,
    @Body() dto: UpdateTimeSlotDto,
  ) {
    return this.masterData.updateTimeSlot(schoolId, periodId, slotId, dto);
  }

  @Delete(":schoolId/academic-periods/:periodId/time-slots/:slotId")
  deleteTimeSlot(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("slotId") slotId: string,
  ) {
    return this.masterData.deleteTimeSlot(schoolId, periodId, slotId);
  }

  @Get(":schoolId/academic-periods/:periodId/grade-shifts")
  listGradeShiftConfigs(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.masterData.listGradeShiftConfigs(schoolId, periodId);
  }

  @Put(":schoolId/academic-periods/:periodId/grade-shifts")
  upsertGradeShiftConfigs(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: UpsertGradeShiftConfigsDto,
  ) {
    return this.masterData.upsertGradeShiftConfigs(schoolId, periodId, dto);
  }

  @Get(":schoolId/academic-periods/:periodId/lesson-requirements")
  listLessonRequirements(@Param("schoolId") schoolId: string, @Param("periodId") periodId: string) {
    return this.masterData.listLessonRequirements(schoolId, periodId);
  }

  @Post(":schoolId/academic-periods/:periodId/lesson-requirements")
  createLessonRequirement(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Body() dto: CreateLessonRequirementDto,
  ) {
    return this.masterData.createLessonRequirement(schoolId, periodId, dto);
  }

  @Get(":schoolId/academic-periods/:periodId/lesson-requirements/:lessonId")
  getLessonRequirement(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("lessonId") lessonId: string,
  ) {
    return this.masterData.getLessonRequirement(schoolId, periodId, lessonId);
  }

  @Patch(":schoolId/academic-periods/:periodId/lesson-requirements/:lessonId")
  updateLessonRequirement(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("lessonId") lessonId: string,
    @Body() dto: UpdateLessonRequirementDto,
  ) {
    return this.masterData.updateLessonRequirement(schoolId, periodId, lessonId, dto);
  }

  @Delete(":schoolId/academic-periods/:periodId/lesson-requirements/:lessonId")
  archiveLessonRequirement(
    @Param("schoolId") schoolId: string,
    @Param("periodId") periodId: string,
    @Param("lessonId") lessonId: string,
  ) {
    return this.masterData.archiveLessonRequirement(schoolId, periodId, lessonId);
  }
}
