/// <reference types="jest" />

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Pool } from "pg";
import { MasterDataService } from "./master-data.service";

const timestamp = "2026-08-24T00:00:00.000Z";

const schoolRow = {
  id: "school-001",
  code: "THCS_DEMO",
  name: "THCS Demo",
  timezone: "Asia/Ho_Chi_Minh",
  status: "ACTIVE" as const,
  created_at: timestamp,
  updated_at: timestamp,
};

const periodRow = {
  id: "period-001",
  school_id: "school-001",
  academic_year: "2026-2027",
  term_code: "TERM_1",
  name: "Học kỳ I",
  starts_on: "2026-08-15",
  ends_on: "2027-01-15",
  status: "DRAFT" as const,
  created_at: timestamp,
  updated_at: timestamp,
};

const slotRow = {
  id: "slot-001",
  school_id: "school-001",
  academic_period_id: "period-001",
  day: 2,
  period: 1,
  shift_code: "AM",
  starts_at: "07:00:00",
  ends_at: "07:45:00",
  created_at: timestamp,
  updated_at: timestamp,
};

const teacherRow = {
  id: "teacher-001",
  school_id: "school-001",
  code: "GV-001",
  display_name: "Nguyễn An",
  status: "ACTIVE" as const,
  created_at: timestamp,
  updated_at: timestamp,
};

const roomRow = {
  id: "room-001",
  school_id: "school-001",
  code: "ROOM-A",
  name: "Phòng A",
  room_type: "STANDARD",
  capacity: 45,
  status: "ACTIVE" as const,
  created_at: timestamp,
  updated_at: timestamp,
};

describe("MasterDataService", () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  let service: MasterDataService;

  beforeEach(() => {
    query.mockReset();
    service = new MasterDataService(pool);
  });

  it("lists only the authenticated school scope", async () => {
    query.mockResolvedValueOnce({ rows: [schoolRow] });

    await expect(service.listSchools("school-001")).resolves.toEqual([expect.objectContaining({ id: "school-001" })]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["school-001"]);
  });

  it("returns the current workspace context for local identity", async () => {
    query.mockResolvedValueOnce({ rows: [schoolRow] });

    await expect(service.getWorkspaceContext("user-001", "school-001")).resolves.toMatchObject({
      userId: "user-001",
      currentSchoolId: "school-001",
      canSwitchSchool: false,
      schools: [expect.objectContaining({ id: "school-001" })],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), ["school-001"]);
  });

  it("lists homeroom assignments within the academic-period scope", async () => {
    query.mockResolvedValueOnce({ rows: [periodRow] }).mockResolvedValueOnce({
      rows: [
        {
          id: "homeroom-001",
          school_id: "school-001",
          academic_period_id: "period-001",
          class_id: "class-001",
          class_code: "7A",
          class_name: "7A",
          teacher_id: "teacher-001",
          teacher_code: "GV-001",
          teacher_name: "Nguyễn An",
          weekly_reduction_periods: 4,
          rule_code: "TT_05_2025_D9_1",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
    });

    await expect(service.listHomeroomAssignments("school-001", "period-001")).resolves.toEqual([
      expect.objectContaining({ classCode: "7A", teacherName: "Nguyễn An", weeklyReductionPeriods: 4 }),
    ]);
  });

  it("calculates the teacher load after the homeroom reduction", async () => {
    query.mockResolvedValueOnce({ rows: [periodRow] }).mockResolvedValueOnce({
      rows: [
        {
          teacher_id: "teacher-001",
          teacher_code: "GV-001",
          teacher_name: "Nguyễn An",
          education_level: "LOWER_SECONDARY",
          standard_weekly_periods: 19,
          teaching_periods: 13,
          homeroom_classes: 1,
          reduction_periods: 4,
          adjusted_weekly_target: 15,
        },
      ],
    });

    await expect(service.getTeacherLoadSummary("school-001", "period-001")).resolves.toEqual([
      expect.objectContaining({
        teacherName: "Nguyễn An",
        teachingPeriods: 13,
        reductionPeriods: 4,
        adjustedWeeklyTarget: 15,
        difference: -2,
        status: "UNDER",
        duties: [{ code: "HOMEROOM_TEACHER", label: "GVCN", count: 1 }],
      }),
    ]);
  });

  it("creates a school and maps database fields to the API contract", async () => {
    query.mockResolvedValueOnce({ rows: [schoolRow] });

    await expect(
      service.createSchool({ code: "THCS_DEMO", name: "THCS Demo", timezone: "Asia/Ho_Chi_Minh" }),
    ).resolves.toEqual({
      id: "school-001",
      code: "THCS_DEMO",
      name: "THCS Demo",
      timezone: "Asia/Ho_Chi_Minh",
      status: "ACTIVE",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO schools"), [
      "THCS_DEMO",
      "THCS Demo",
      "Asia/Ho_Chi_Minh",
    ]);
  });

  it("creates a room with capability fields", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "school-001" }] }).mockResolvedValueOnce({ rows: [roomRow] });

    await expect(
      service.createRoom("school-001", { code: "ROOM-A", name: "Phòng A", roomType: "STANDARD", capacity: 45 }),
    ).resolves.toMatchObject({
      code: "ROOM-A",
      roomType: "STANDARD",
      capacity: 45,
      status: "ACTIVE",
    });
  });

  it("rejects an empty school update before querying the database", async () => {
    await expect(service.updateSchool("school-001", {})).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an invalid school timezone", async () => {
    await expect(
      service.createSchool({ code: "INVALID_TZ", name: "Invalid timezone", timezone: "Mars/Olympus" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("enforces school scope when reading an academic period", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(service.getAcademicPeriod("other-school", "period-001")).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1 AND school_id = $2"), [
      "period-001",
      "other-school",
    ]);
  });

  it("rejects an academic period whose end date precedes its start date", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "school-001" }] });

    await expect(
      service.createAcademicPeriod("school-001", {
        academicYear: "2026-2027",
        termCode: "TERM_1",
        name: "Invalid period",
        startsOn: "2027-01-15",
        endsOn: "2026-08-15",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("blocks time-slot creation for an archived academic period", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...periodRow, status: "ARCHIVED" }] });

    await expect(service.createTimeSlot("school-001", "period-001", { day: 2, period: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("blocks deletion when a time slot is referenced by an assignment", async () => {
    query.mockResolvedValueOnce({ rows: [slotRow] }).mockResolvedValueOnce({ rows: [{ referenced: true }] });

    await expect(service.deleteTimeSlot("school-001", "period-001", "slot-001")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects an assignment that references a master record from another school", async () => {
    query.mockResolvedValueOnce({ rows: [periodRow] }).mockResolvedValueOnce({ rows: [] });

    await expect(
      service.createLessonRequirement("school-001", "period-001", {
        classId: "class-from-other-school",
        subjectId: "subject-001",
        teacherId: "teacher-001",
        requiredSessions: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate class-subject-teacher demand within one period", async () => {
    query
      .mockResolvedValueOnce({ rows: [periodRow] })
      .mockResolvedValueOnce({ rows: [{ id: "class-001", status: "ACTIVE" }] })
      .mockResolvedValueOnce({ rows: [{ id: "subject-001", status: "ACTIVE" }] })
      .mockResolvedValueOnce({ rows: [teacherRow] })
      .mockResolvedValueOnce({ rows: [{ id: "existing-lesson" }] });

    await expect(
      service.createLessonRequirement("school-001", "period-001", {
        classId: "class-001",
        subjectId: "subject-001",
        teacherId: "teacher-001",
        requiredSessions: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("deletes an unreferenced time slot inside the requested scope", async () => {
    query
      .mockResolvedValueOnce({ rows: [slotRow] })
      .mockResolvedValueOnce({ rows: [{ referenced: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "slot-001" }] });

    await expect(service.deleteTimeSlot("school-001", "period-001", "slot-001")).resolves.toEqual({
      id: "slot-001",
      deleted: true,
    });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("DELETE FROM time_slots"), [
      "slot-001",
      "school-001",
      "period-001",
    ]);
  });
});
