import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import { PG_POOL } from "../database/database.module";
import { deriveSubjectCode } from "../contracts/subject-code";
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
  DEFAULT_TIMEZONE,
  UpdateAcademicPeriodDto,
  UpdateClassDto,
  UpdateLessonRequirementDto,
  UpdateRoomDto,
  UpdateSchoolDto,
  UpdateSubjectDto,
  UpdateTeacherDto,
  UpdateTimeSlotDto,
  UpsertGradeShiftConfigsDto,
} from "./master-data.dto";

interface SchoolRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface AcademicPeriodRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  school_id: string;
  academic_year: string;
  term_code: string;
  name: string;
  starts_on: string | Date;
  ends_on: string | Date;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface TimeSlotRow extends QueryResultRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  day: number;
  period: number;
  shift_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface GradeShiftConfigRow extends QueryResultRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  grade: number;
  main_shift_code: "MORNING" | "AFTERNOON";
  secondary_shift_code: "MORNING" | "AFTERNOON";
  allow_secondary: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TeacherRow extends QueryResultRow {
  id: string;
  school_id: string;
  code: string;
  display_name: string;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface ClassRow extends QueryResultRow {
  id: string;
  school_id: string;
  code: string;
  name: string;
  grade: number;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface HomeroomAssignmentRow extends QueryResultRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  teacher_id: string;
  teacher_code: string;
  teacher_name: string;
  weekly_reduction_periods: number;
  rule_code: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TeacherSubjectGradeAssignmentRow extends QueryResultRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  teacher_id: string;
  subject_id: string;
  grade: number;
  status: "ACTIVE" | "ARCHIVED";
  source_ref: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TeacherLoadSummaryRow extends QueryResultRow {
  teacher_id: string;
  teacher_code: string;
  teacher_name: string;
  education_level: string;
  standard_weekly_periods: number;
  teaching_periods: number;
  subject_count: number;
  grade_count: number;
  subject_codes: string[];
  grades: number[];
  homeroom_classes: number;
  reduction_periods: number;
  adjusted_weekly_target: number;
}

export interface TeacherLoadRuleSummary {
  ruleCode: string;
  ruleSetVersion: string;
  ruleSnapshotId: string | null;
  sourceUrl: string;
  sourceLocator: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  enforcement: "REPORT_ONLY" | "HARD_CAP";
}

interface TeacherLoadRuleSnapshotRow extends QueryResultRow {
  id: string;
  rule_set_version: string;
  source_url: string;
  source_locator: string | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
  rules: Array<{ code?: unknown; kind?: unknown }> | string;
}

interface SubjectRow extends QueryResultRow {
  id: string;
  school_id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface RoomRow extends QueryResultRow {
  id: string;
  school_id: string;
  code: string;
  name: string;
  room_type: string | null;
  capacity: number | null;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

interface LessonRequirementRow extends QueryResultRow {
  id: string;
  tenant_id?: string;
  school_id: string;
  academic_period_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string | null;
  required_sessions: number;
  fixed_slot_id: string | null;
  activity_type: "LESSON" | "FLAG_CEREMONY";
  status: "ACTIVE" | "ARCHIVED";
  demand_id?: string | null;
  assignment_source?: "MANUAL" | "AUTO";
  assignment_locked?: boolean;
  assignment_run_id?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

@Injectable()
export class MasterDataService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getWorkspaceContext(userId: string, schoolId: string, tenantId?: string) {
    let result = tenantId
      ? await this.pool.query<SchoolRow>(
          `SELECT DISTINCT school.id::text, school.code, school.name, school.timezone, school.status,
                  school.created_at, school.updated_at
             FROM tenant_memberships membership
             JOIN schools school ON school.id = membership.school_id AND school.tenant_id = membership.tenant_id
            WHERE membership.tenant_id = $1
              AND membership.user_id = $2
              AND membership.status = 'ACTIVE'
              AND (membership.school_id IS NULL OR membership.school_id = school.id)
              AND school.status = 'ACTIVE'
            ORDER BY school.code`,
          [tenantId, userId],
        )
      : await this.pool.query<SchoolRow>(
          `SELECT id::text, code, name, timezone, status, created_at, updated_at
             FROM schools
            WHERE id = $1
            ORDER BY code`,
          [schoolId],
        );

    if (result.rows.length === 0 && tenantId) {
      result = await this.pool.query<SchoolRow>(
        `SELECT id::text, code, name, timezone, status, created_at, updated_at
           FROM schools
          WHERE id = $1 AND tenant_id = $2
          ORDER BY code`,
        [schoolId, tenantId],
      );
    }

    const schools = result.rows.map((row) => this.toSchool(row));
    return {
      userId,
      currentSchoolId: schoolId,
      schools,
      canSwitchSchool: schools.length > 1,
    };
  }

  async listSchools(schoolId: string) {
    const result = await this.pool.query<SchoolRow>(
      `SELECT id::text, code, name, timezone, status, created_at, updated_at
         FROM schools
        WHERE id = $1
        ORDER BY code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toSchool(row));
  }

  async getSchool(schoolId: string) {
    const result = await this.pool.query<SchoolRow>(
      `SELECT id::text, code, name, timezone, status, created_at, updated_at
         FROM schools
        WHERE id = $1`,
      [schoolId],
    );
    const school = result.rows[0];
    if (!school) {
      throw this.notFound("SCHOOL_NOT_FOUND", "School không tồn tại.");
    }

    return this.toSchool(school);
  }

  async createSchool(dto: CreateSchoolDto) {
    const timezone = this.validateTimezone(dto.timezone ?? DEFAULT_TIMEZONE);
    try {
      const result = await this.pool.query<SchoolRow>(
        `INSERT INTO schools (code, name, timezone, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         RETURNING id::text, code, name, timezone, status, created_at, updated_at`,
        [this.requiredText(dto.code, "code"), this.requiredText(dto.name, "name"), timezone],
      );
      return this.toSchool(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã school đã tồn tại.");
    }
  }

  async updateSchool(schoolId: string, dto: UpdateSchoolDto) {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (dto.code !== undefined) {
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(dto.code, "code"));
    }
    if (dto.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(this.requiredText(dto.name, "name"));
    }
    if (dto.timezone !== undefined) {
      updates.push(`timezone = $${values.length + 1}`);
      values.push(this.validateTimezone(dto.timezone));
    }
    if (updates.length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS_TO_UPDATE", message: "Không có trường hợp lệ để cập nhật." });
    }

    values.push(schoolId);
    try {
      const result = await this.pool.query<SchoolRow>(
        `UPDATE schools
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
        RETURNING id::text, code, name, timezone, status, created_at, updated_at`,
        values,
      );
      const school = result.rows[0];
      if (!school) {
        throw this.notFound("SCHOOL_NOT_FOUND", "School không tồn tại.");
      }
      return this.toSchool(school);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw this.translateDatabaseError(error, "Mã school đã tồn tại.");
    }
  }

  async archiveSchool(schoolId: string) {
    const result = await this.pool.query<SchoolRow>(
      `UPDATE schools
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1
      RETURNING id::text, code, name, timezone, status, created_at, updated_at`,
      [schoolId],
    );
    const school = result.rows[0];
    if (!school) {
      throw this.notFound("SCHOOL_NOT_FOUND", "School không tồn tại.");
    }
    return this.toSchool(school);
  }

  async listAcademicPeriods(schoolId: string) {
    await this.ensureSchool(schoolId);
    const result = await this.pool.query<AcademicPeriodRow>(
      `SELECT id::text, tenant_id::text, school_id::text, academic_year, term_code, name,
              starts_on, ends_on, status, created_at, updated_at
         FROM academic_periods
        WHERE school_id = $1
        ORDER BY starts_on DESC, term_code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toAcademicPeriod(row));
  }

  async getAcademicPeriod(schoolId: string, periodId: string) {
    const result = await this.pool.query<AcademicPeriodRow>(
      `SELECT id::text, school_id::text, academic_year, term_code, name,
              starts_on, ends_on, status, created_at, updated_at
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [periodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) {
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Khung năm học không tồn tại trong phạm vi trường.");
    }
    return this.toAcademicPeriod(period);
  }

  async createAcademicPeriod(schoolId: string, dto: CreateAcademicPeriodDto) {
    await this.ensureSchool(schoolId);
    this.validateDateRange(dto.startsOn, dto.endsOn);
    try {
      const result = await this.pool.query<AcademicPeriodRow>(
        `INSERT INTO academic_periods
          (tenant_id, school_id, academic_year, term_code, name, starts_on, ends_on, status)
         SELECT tenant_id, $1, $2, $3, $4, $5, $6, 'DRAFT'
           FROM schools
          WHERE id = $1
         RETURNING id::text, school_id::text, academic_year, term_code, name,
                   starts_on, ends_on, status, created_at, updated_at`,
        [
          schoolId,
          this.requiredText(dto.academicYear, "academicYear"),
          this.requiredText(dto.termCode, "termCode"),
          this.requiredText(dto.name, "name"),
          dto.startsOn,
          dto.endsOn,
        ],
      );
      return this.toAcademicPeriod(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Khung năm học đã tồn tại trong trường.");
    }
  }

  async updateAcademicPeriod(schoolId: string, periodId: string, dto: UpdateAcademicPeriodDto) {
    const current = await this.getAcademicPeriodRow(schoolId, periodId);
    const values: unknown[] = [];
    const updates: string[] = [];
    const academicYear = dto.academicYear ?? current.academic_year;
    const termCode = dto.termCode ?? current.term_code;
    const name = dto.name ?? current.name;
    const startsOn = dto.startsOn ?? this.dateOnly(current.starts_on);
    const endsOn = dto.endsOn ?? this.dateOnly(current.ends_on);
    this.validateDateRange(startsOn, endsOn);

    const add = (column: string, value: unknown) => {
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };
    add("academic_year", this.requiredText(academicYear, "academicYear"));
    add("term_code", this.requiredText(termCode, "termCode"));
    add("name", this.requiredText(name, "name"));
    add("starts_on", startsOn);
    add("ends_on", endsOn);
    values.push(periodId, schoolId);

    try {
      const result = await this.pool.query<AcademicPeriodRow>(
        `UPDATE academic_periods
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND school_id = $${values.length}
        RETURNING id::text, school_id::text, academic_year, term_code, name,
                  starts_on, ends_on, status, created_at, updated_at`,
        values,
      );
      return this.toAcademicPeriod(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Khung năm học đã tồn tại trong trường.");
    }
  }

  async archiveAcademicPeriod(schoolId: string, periodId: string) {
    const result = await this.pool.query<AcademicPeriodRow>(
      `UPDATE academic_periods
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2
      RETURNING id::text, school_id::text, academic_year, term_code, name,
                starts_on, ends_on, status, created_at, updated_at`,
      [periodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) {
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Khung năm học không tồn tại trong phạm vi trường.");
    }
    return this.toAcademicPeriod(period);
  }

  async listTimeSlots(schoolId: string, periodId: string) {
    await this.ensureAcademicPeriod(schoolId, periodId);
    const result = await this.pool.query<TimeSlotRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, day, period,
              shift_code, starts_at::text, ends_at::text, created_at, updated_at
         FROM time_slots
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY day, CASE shift_code WHEN 'MORNING' THEN 1 ELSE 2 END, period`,
      [schoolId, periodId],
    );
    return result.rows.map((row) => this.toTimeSlot(row));
  }

  async createTimeSlot(schoolId: string, periodId: string, dto: CreateTimeSlotDto) {
    const period = await this.ensureAcademicPeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể thêm khung tiết vào khung năm học đã lưu trữ.",
      });
    }
    this.validateClockRange(dto.startsAt, dto.endsAt);
    try {
      const result = await this.pool.query<TimeSlotRow>(
        `INSERT INTO time_slots
          (tenant_id, school_id, academic_period_id, day, period, shift_code, starts_at, ends_at)
         SELECT tenant_id, $1, $2, $3, $4, $5, $6, $7
           FROM academic_periods
          WHERE id = $2 AND school_id = $1
         RETURNING id::text, school_id::text, academic_period_id::text, day, period,
                   shift_code, starts_at::text, ends_at::text, created_at, updated_at`,
        [schoolId, periodId, dto.day, dto.period, dto.shiftCode ?? "MORNING", dto.startsAt ?? null, dto.endsAt ?? null],
      );
      return this.toTimeSlot(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Khung tiết đã tồn tại trong khung năm học.");
    }
  }

  async updateTimeSlot(schoolId: string, periodId: string, slotId: string, dto: UpdateTimeSlotDto) {
    const current = await this.getTimeSlotRow(schoolId, periodId, slotId);
    const day = dto.day ?? current.day;
    const period = dto.period ?? current.period;
    const startsAt = dto.startsAt ?? current.starts_at;
    const endsAt = dto.endsAt ?? current.ends_at;
    this.validateClockRange(startsAt ?? undefined, endsAt ?? undefined);

    const values: unknown[] = [];
    const updates: string[] = [];
    const add = (column: string, value: unknown) => {
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };
    if (dto.day !== undefined) add("day", day);
    if (dto.period !== undefined) add("period", period);
    if (dto.shiftCode !== undefined) add("shift_code", dto.shiftCode);
    if (dto.startsAt !== undefined) add("starts_at", startsAt);
    if (dto.endsAt !== undefined) add("ends_at", endsAt);
    if (updates.length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS_TO_UPDATE", message: "Không có trường hợp lệ để cập nhật." });
    }
    values.push(slotId, schoolId, periodId);

    try {
      const result = await this.pool.query<TimeSlotRow>(
        `UPDATE time_slots
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 2}
            AND school_id = $${values.length - 1}
            AND academic_period_id = $${values.length}
        RETURNING id::text, school_id::text, academic_period_id::text, day, period,
                  shift_code, starts_at::text, ends_at::text, created_at, updated_at`,
        values,
      );
      return this.toTimeSlot(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Khung tiết đã tồn tại trong khung năm học.");
    }
  }

  async deleteTimeSlot(schoolId: string, periodId: string, slotId: string) {
    await this.getTimeSlotRow(schoolId, periodId, slotId);
    const reference = await this.pool.query<{ referenced: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM optimization_assignments WHERE time_slot_id = $1)
           OR EXISTS (SELECT 1 FROM schedule_assignments WHERE time_slot_id = $1) AS referenced`,
      [slotId],
    );
    if (reference.rows[0]?.referenced) {
      throw new ConflictException({
        code: "RESOURCE_REFERENCED",
        message: "Không thể xóa khung tiết đang được phân công tham chiếu.",
      });
    }

    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM time_slots
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3
      RETURNING id::text`,
      [slotId, schoolId, periodId],
    );
    if (!result.rows[0]) {
      throw this.notFound("TIME_SLOT_NOT_FOUND", "Khung tiết không tồn tại trong phạm vi khung năm học.");
    }
    return { id: result.rows[0].id, deleted: true };
  }

  async listGradeShiftConfigs(schoolId: string, periodId: string) {
    await this.ensureAcademicPeriod(schoolId, periodId);
    const result = await this.pool.query<GradeShiftConfigRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, grade,
              main_shift_code, secondary_shift_code, allow_secondary, created_at, updated_at
         FROM academic_period_grade_shifts
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY grade`,
      [schoolId, periodId],
    );
    return result.rows.map((row) => this.toGradeShiftConfig(row));
  }

  async upsertGradeShiftConfigs(schoolId: string, periodId: string, dto: UpsertGradeShiftConfigsDto) {
    const period = await this.ensureAcademicPeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể cấu hình buổi học cho khung năm học đã lưu trữ.",
      });
    }
    const seenGrades = new Set<number>();
    for (const config of dto.configs) {
      if (seenGrades.has(config.grade)) {
        throw new BadRequestException({ code: "DUPLICATE_GRADE", message: `Khối ${config.grade} bị lặp.` });
      }
      seenGrades.add(config.grade);
      if (config.mainShiftCode === config.secondaryShiftCode) {
        throw new BadRequestException({
          code: "DUPLICATE_SHIFT",
          message: `Khối ${config.grade} phải có buổi chính và buổi phụ khác nhau.`,
        });
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const config of dto.configs) {
        await client.query(
          `INSERT INTO academic_period_grade_shifts
             (tenant_id, school_id, academic_period_id, grade, main_shift_code, secondary_shift_code, allow_secondary)
           SELECT tenant_id, $1, $2, $3, $4, $5, $6
             FROM academic_periods
            WHERE school_id = $1 AND id = $2
           ON CONFLICT (tenant_id, school_id, academic_period_id, grade)
           DO UPDATE SET main_shift_code = EXCLUDED.main_shift_code,
                         secondary_shift_code = EXCLUDED.secondary_shift_code,
                         allow_secondary = EXCLUDED.allow_secondary,
                         updated_at = now()`,
          [
            schoolId,
            periodId,
            config.grade,
            config.mainShiftCode,
            config.secondaryShiftCode,
            config.allowSecondary ?? true,
          ],
        );
      }
      await client.query(
        `UPDATE lesson_requirements AS lesson
            SET fixed_slot_id = slot.id,
                updated_at = now()
           FROM classes AS klass
           JOIN academic_period_grade_shifts AS preference
             ON preference.tenant_id = klass.tenant_id
            AND preference.school_id = klass.school_id
            AND preference.academic_period_id = $2
            AND preference.grade = klass.grade
           JOIN time_slots AS slot
             ON slot.tenant_id = preference.tenant_id
            AND slot.school_id = preference.school_id
            AND slot.academic_period_id = preference.academic_period_id
            AND slot.day = 1
            AND slot.shift_code = preference.main_shift_code
            AND slot.period = CASE
              WHEN preference.main_shift_code = 'AFTERNOON' THEN 5
              ELSE 1
            END
          WHERE lesson.tenant_id = $3
            AND lesson.school_id = $1
            AND lesson.academic_period_id = $2
            AND lesson.class_id = klass.id
            AND lesson.activity_type = 'FLAG_CEREMONY'
            AND lesson.status = 'ACTIVE'`,
        [schoolId, periodId, period.tenant_id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw this.translateDatabaseError(error, "Không thể lưu cấu hình buổi học.");
    } finally {
      client.release();
    }
    return this.listGradeShiftConfigs(schoolId, periodId);
  }

  async listTeachers(schoolId: string) {
    await this.ensureSchool(schoolId);
    const result = await this.pool.query<TeacherRow>(
      `SELECT id::text, school_id::text, code, display_name, status, created_at, updated_at
         FROM teachers
        WHERE school_id = $1
        ORDER BY code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toTeacher(row));
  }

  async getTeacher(schoolId: string, teacherId: string) {
    const result = await this.pool.query<TeacherRow>(
      `SELECT id::text, school_id::text, code, display_name, status, created_at, updated_at
         FROM teachers
        WHERE id = $1 AND school_id = $2`,
      [teacherId, schoolId],
    );
    const teacher = result.rows[0];
    if (!teacher) throw this.notFound("TEACHER_NOT_FOUND", "Giáo viên không tồn tại trong school scope.");
    return this.toTeacher(teacher);
  }

  async createTeacher(schoolId: string, dto: CreateTeacherDto) {
    await this.ensureSchool(schoolId);
    try {
      const result = await this.pool.query<TeacherRow>(
        `INSERT INTO teachers (tenant_id, school_id, code, display_name, status)
         SELECT tenant_id, $1, $2, $3, 'ACTIVE'
           FROM schools
          WHERE id = $1
         RETURNING id::text, school_id::text, code, display_name, status, created_at, updated_at`,
        [schoolId, this.requiredText(dto.code, "code"), this.requiredText(dto.displayName, "displayName")],
      );
      return this.toTeacher(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã giáo viên hoặc tên giáo viên đã tồn tại trong school.");
    }
  }

  async updateTeacher(schoolId: string, teacherId: string, dto: UpdateTeacherDto) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (dto.code !== undefined) {
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(dto.code, "code"));
    }
    if (dto.displayName !== undefined) {
      updates.push(`display_name = $${values.length + 1}`);
      values.push(this.requiredText(dto.displayName, "displayName"));
    }
    if (updates.length === 0) throw this.noFieldsToUpdate();
    values.push(teacherId, schoolId);
    try {
      const result = await this.pool.query<TeacherRow>(
        `UPDATE teachers
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND school_id = $${values.length}
        RETURNING id::text, school_id::text, code, display_name, status, created_at, updated_at`,
        values,
      );
      const teacher = result.rows[0];
      if (!teacher) throw this.notFound("TEACHER_NOT_FOUND", "Giáo viên không tồn tại trong school scope.");
      return this.toTeacher(teacher);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw this.translateDatabaseError(error, "Mã giáo viên hoặc tên giáo viên đã tồn tại trong school.");
    }
  }

  async archiveTeacher(schoolId: string, teacherId: string) {
    const result = await this.pool.query<TeacherRow>(
      `UPDATE teachers
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2
      RETURNING id::text, school_id::text, code, display_name, status, created_at, updated_at`,
      [teacherId, schoolId],
    );
    const teacher = result.rows[0];
    if (!teacher) throw this.notFound("TEACHER_NOT_FOUND", "Giáo viên không tồn tại trong school scope.");
    return this.toTeacher(teacher);
  }

  async listClasses(schoolId: string) {
    await this.ensureSchool(schoolId);
    const result = await this.pool.query<ClassRow>(
      `SELECT id::text, school_id::text, code, name, grade, status, created_at, updated_at
         FROM classes
        WHERE school_id = $1
        ORDER BY code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toClass(row));
  }

  async listHomeroomAssignments(schoolId: string, academicPeriodId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const result = await this.pool.query<HomeroomAssignmentRow>(
      `SELECT assignment.id::text,
              assignment.school_id::text,
              assignment.academic_period_id::text,
              assignment.class_id::text,
              class.code AS class_code,
              class.name AS class_name,
              assignment.teacher_id::text,
              teacher.code AS teacher_code,
              teacher.display_name AS teacher_name,
              assignment.weekly_reduction_periods,
              assignment.rule_code,
              assignment.created_at,
              assignment.updated_at
         FROM class_homeroom_assignments assignment
         JOIN classes class ON class.tenant_id = assignment.tenant_id AND class.id = assignment.class_id
         JOIN teachers teacher ON teacher.tenant_id = assignment.tenant_id AND teacher.id = assignment.teacher_id
        WHERE assignment.school_id = $1 AND assignment.academic_period_id = $2
        ORDER BY class.code`,
      [schoolId, academicPeriodId],
    );
    return result.rows.map((row) => this.toHomeroomAssignment(row));
  }

  async listTeacherSubjectGradeAssignments(schoolId: string, academicPeriodId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const result = await this.pool.query<TeacherSubjectGradeAssignmentRow>(
      `SELECT id::text, school_id::text, academic_period_id::text,
              teacher_id::text, subject_id::text, grade, status, source_ref,
              created_at, updated_at
         FROM teacher_subject_grade_assignments
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY teacher_id, subject_id, grade`,
      [schoolId, academicPeriodId],
    );
    return result.rows.map((row) => this.toTeacherSubjectGradeAssignment(row));
  }

  async assignTeacherSubjectGrade(schoolId: string, academicPeriodId: string, dto: AssignTeacherSubjectGradeDto) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    await this.ensureActiveReference(
      "teachers",
      dto.teacherId,
      schoolId,
      "TEACHER_NOT_FOUND",
      "TEACHER_ARCHIVED",
      "Giáo viên",
    );
    await this.ensureActiveReference(
      "subjects",
      dto.subjectId,
      schoolId,
      "SUBJECT_NOT_FOUND",
      "SUBJECT_ARCHIVED",
      "Môn học",
    );
    const existing = await this.pool.query<{ id: string; status: "ACTIVE" | "ARCHIVED" }>(
      `SELECT id::text, status
         FROM teacher_subject_grade_assignments
        WHERE school_id = $1
          AND academic_period_id = $2
          AND teacher_id = $3
          AND subject_id = $4
          AND grade = $5`,
      [schoolId, academicPeriodId, dto.teacherId, dto.subjectId, dto.grade],
    );
    if (existing.rows[0]?.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ARCHIVED_ASSIGNMENT",
        message: "Không thể tự động khôi phục phân công chuyên môn đã lưu trữ.",
      });
    }
    const result = await this.pool.query<TeacherSubjectGradeAssignmentRow>(
      `INSERT INTO teacher_subject_grade_assignments
        (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade, status, source_ref)
       SELECT school.tenant_id, $1, $2, $3, $4, $5, 'ACTIVE', 'MANUAL_UI'
         FROM schools school
        WHERE school.id = $1
       ON CONFLICT (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
       DO UPDATE SET source_ref = EXCLUDED.source_ref, updated_at = now()
       RETURNING id::text, school_id::text, academic_period_id::text,
                 teacher_id::text, subject_id::text, grade, status, source_ref,
                 created_at, updated_at`,
      [schoolId, academicPeriodId, dto.teacherId, dto.subjectId, dto.grade],
    );
    const assignment = result.rows[0];
    if (!assignment) throw this.notFound("ASSIGNMENT_NOT_FOUND", "Không thể lưu phân công chuyên môn.");
    return this.toTeacherSubjectGradeAssignment(assignment);
  }

  async archiveTeacherSubjectGrade(schoolId: string, academicPeriodId: string, assignmentId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const result = await this.pool.query<TeacherSubjectGradeAssignmentRow>(
      `UPDATE teacher_subject_grade_assignments
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3 AND status = 'ACTIVE'
      RETURNING id::text, school_id::text, academic_period_id::text,
                teacher_id::text, subject_id::text, grade, status, source_ref,
                created_at, updated_at`,
      [assignmentId, schoolId, academicPeriodId],
    );
    const assignment = result.rows[0];
    if (!assignment)
      throw this.notFound("ASSIGNMENT_NOT_FOUND", "Phân công chuyên môn không tồn tại hoặc đã được lưu trữ.");
    return this.toTeacherSubjectGradeAssignment(assignment);
  }

  async getTeacherSubjectGradeCoverage(schoolId: string, academicPeriodId: string) {
    const [assignments, classes] = await Promise.all([
      this.listTeacherSubjectGradeAssignments(schoolId, academicPeriodId),
      this.listClasses(schoolId),
    ]);
    const activeAssignments = assignments.filter((assignment) => assignment.status === "ACTIVE");
    const activeClasses = classes.filter((item) => item.status === "ACTIVE");
    const coveredGrades = [...new Set(activeAssignments.map((assignment) => assignment.grade))].sort(
      (left, right) => left - right,
    );
    const activeClassGrades = [...new Set(activeClasses.map((item) => item.grade))].sort((left, right) => left - right);
    return {
      contractVersion: "TEACHER-SUBJECT-GRADE-COVERAGE-1.0.0",
      schoolId,
      academicPeriodId,
      activeAssignmentCount: activeAssignments.length,
      activeClassCount: activeClasses.length,
      coveredGrades,
      uncoveredGrades: activeClassGrades.filter((grade) => !coveredGrades.includes(grade)),
      assignments,
    };
  }

  async assignHomeroomTeacher(
    schoolId: string,
    academicPeriodId: string,
    classId: string,
    dto: AssignHomeroomTeacherDto,
  ) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const classResult = await this.pool.query<{ id: string }>(
      `SELECT id::text FROM classes WHERE id = $1 AND school_id = $2 AND status = 'ACTIVE'`,
      [classId, schoolId],
    );
    if (classResult.rows.length === 0) throw this.notFound("CLASS_NOT_FOUND", "Lớp không tồn tại trong school scope.");
    const teacherResult = await this.pool.query<{ id: string }>(
      `SELECT id::text FROM teachers WHERE id = $1 AND school_id = $2 AND status = 'ACTIVE'`,
      [dto.teacherId, schoolId],
    );
    if (teacherResult.rows.length === 0)
      throw this.notFound("TEACHER_NOT_FOUND", "Giáo viên không tồn tại trong school scope.");

    await this.pool.query(
      `INSERT INTO class_homeroom_assignments
         (tenant_id, school_id, academic_period_id, class_id, teacher_id,
          weekly_reduction_periods, rule_code)
       SELECT school.tenant_id, $1, $2, $3, $4, $5, $6
         FROM schools school
        WHERE school.id = $1
       ON CONFLICT (tenant_id, school_id, academic_period_id, class_id)
       DO UPDATE SET teacher_id = EXCLUDED.teacher_id,
                     weekly_reduction_periods = EXCLUDED.weekly_reduction_periods,
                     rule_code = EXCLUDED.rule_code,
                     updated_at = now()`,
      [
        schoolId,
        academicPeriodId,
        classId,
        dto.teacherId,
        dto.weeklyReductionPeriods ?? 4,
        dto.ruleCode?.trim() || "TT_05_2025_D9_1",
      ],
    );
    const assignments = await this.listHomeroomAssignments(schoolId, academicPeriodId);
    const assignment = assignments.find((item) => item.classId === classId);
    if (!assignment) throw this.notFound("HOMEROOM_ASSIGNMENT_NOT_FOUND", "Không thể đọc lại phân công GVCN vừa lưu.");
    return assignment;
  }

  async removeHomeroomTeacher(schoolId: string, academicPeriodId: string, classId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM class_homeroom_assignments
        WHERE school_id = $1 AND academic_period_id = $2 AND class_id = $3
        RETURNING id::text`,
      [schoolId, academicPeriodId, classId],
    );
    return { classId, deleted: result.rows.length > 0 };
  }

  async getTeacherLoadSummary(schoolId: string, academicPeriodId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const [result, rule] = await Promise.all([
      this.pool.query<TeacherLoadSummaryRow>(
        `WITH teaching AS (
               SELECT lesson.teacher_id,
                      COALESCE(SUM(lesson.required_sessions), 0)::int AS teaching_periods,
                      COUNT(DISTINCT lesson.subject_id)::int AS subject_count,
                      COUNT(DISTINCT class.grade)::int AS grade_count,
                      COALESCE(ARRAY_AGG(DISTINCT subject.code ORDER BY subject.code), ARRAY[]::text[]) AS subject_codes,
                      COALESCE(ARRAY_AGG(DISTINCT class.grade ORDER BY class.grade), ARRAY[]::smallint[]) AS grades
                 FROM lesson_requirements lesson
                 JOIN classes class
                   ON class.id = lesson.class_id
                  AND class.school_id = lesson.school_id
                 JOIN subjects subject
                   ON subject.id = lesson.subject_id
                  AND subject.school_id = lesson.school_id
                WHERE lesson.school_id = $1
                  AND lesson.academic_period_id = $2
                  AND lesson.status = 'ACTIVE'
                GROUP BY lesson.teacher_id
             ), homeroom AS (
               SELECT teacher_id,
                      COUNT(*)::int AS homeroom_classes,
                      COALESCE(SUM(weekly_reduction_periods), 0)::int AS reduction_periods
                 FROM class_homeroom_assignments
                WHERE school_id = $1 AND academic_period_id = $2
                GROUP BY teacher_id
             )
         SELECT teacher.id::text AS teacher_id,
                teacher.code AS teacher_code,
                teacher.display_name AS teacher_name,
                school.education_level,
                CASE school.education_level
                  WHEN 'PRIMARY' THEN 23
                  WHEN 'UPPER_SECONDARY' THEN 17
                  ELSE 19
                END::int AS standard_weekly_periods,
                COALESCE(teaching.teaching_periods, 0)::int AS teaching_periods,
                COALESCE(teaching.subject_count, 0)::int AS subject_count,
                COALESCE(teaching.grade_count, 0)::int AS grade_count,
                COALESCE(teaching.subject_codes, ARRAY[]::text[]) AS subject_codes,
                COALESCE(teaching.grades, ARRAY[]::smallint[]) AS grades,
                COALESCE(homeroom.homeroom_classes, 0)::int AS homeroom_classes,
                COALESCE(homeroom.reduction_periods, 0)::int AS reduction_periods,
                GREATEST(
                  CASE school.education_level
                    WHEN 'PRIMARY' THEN 23
                    WHEN 'UPPER_SECONDARY' THEN 17
                    ELSE 19
                  END - COALESCE(homeroom.reduction_periods, 0),
                  0
                )::int AS adjusted_weekly_target
           FROM teachers teacher
           JOIN schools school ON school.id = teacher.school_id
           LEFT JOIN teaching ON teaching.teacher_id = teacher.id
           LEFT JOIN homeroom ON homeroom.teacher_id = teacher.id
          WHERE teacher.school_id = $1 AND teacher.status = 'ACTIVE'
          ORDER BY teacher.code`,
        [schoolId, academicPeriodId],
      ),
      this.getTeacherLoadRuleSummary(schoolId, academicPeriodId),
    ]);
    return result.rows.map((row) => {
      const difference = row.teaching_periods - row.adjusted_weekly_target;
      return {
        teacherId: row.teacher_id,
        teacherCode: row.teacher_code,
        teacherName: row.teacher_name,
        educationLevel: row.education_level,
        standardWeeklyPeriods: row.standard_weekly_periods,
        teachingPeriods: row.teaching_periods,
        subjectCount: row.subject_count,
        gradeCount: row.grade_count,
        subjectCodes: row.subject_codes ?? [],
        grades: (row.grades ?? []).map(Number),
        homeroomClasses: row.homeroom_classes,
        reductionPeriods: row.reduction_periods,
        adjustedWeeklyTarget: row.adjusted_weekly_target,
        difference,
        status: difference > 0 ? "OVER" : difference < 0 ? "UNDER" : "ON_TARGET",
        rule,
        duties:
          row.homeroom_classes > 0 ? [{ code: "HOMEROOM_TEACHER", label: "GVCN", count: row.homeroom_classes }] : [],
      };
    });
  }

  private async getTeacherLoadRuleSummary(schoolId: string, academicPeriodId: string): Promise<TeacherLoadRuleSummary> {
    const result = await this.pool.query<TeacherLoadRuleSnapshotRow>(
      `SELECT id::text,
              rule_set_version,
              source_url,
              source_locator,
              effective_from::text,
              effective_to::text,
              rules
         FROM rule_set_snapshots
        WHERE school_id = $1
          AND approval_state = 'APPROVED'
          AND (
            scope ->> 'academicPeriodId' IS NULL
            OR scope ->> 'academicPeriodId' = $2
          )
        ORDER BY captured_at DESC, id DESC
        LIMIT 1`,
      [schoolId, academicPeriodId],
    );
    const snapshot = result.rows[0];
    if (!snapshot) {
      return {
        ruleCode: "RULE-TEACH-002",
        ruleSetVersion: "Chưa có snapshot đã duyệt",
        ruleSnapshotId: null,
        sourceUrl:
          "https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-05-2025-tt-bgddt-quy-dinh-che-do-lam-viec-doi-voi-giao-vien-pho-thong-du-bi-dai-hoc-119250311185323893.htm",
        sourceLocator: "SRC-TT05-2025#7.3.a",
        effectiveFrom: "2025-04-22",
        effectiveTo: null,
        enforcement: "REPORT_ONLY",
      };
    }
    const rules =
      typeof snapshot.rules === "string"
        ? (JSON.parse(snapshot.rules) as Array<Record<string, unknown>>)
        : snapshot.rules;
    const normRule = rules.find((candidate) => candidate.code === "RULE-TEACH-002");
    return {
      ruleCode: typeof normRule?.code === "string" ? normRule.code : "RULE-TEACH-002",
      ruleSetVersion: snapshot.rule_set_version,
      ruleSnapshotId: snapshot.id,
      sourceUrl: snapshot.source_url,
      sourceLocator: snapshot.source_locator,
      effectiveFrom: this.dateOnly(snapshot.effective_from),
      effectiveTo: snapshot.effective_to ? this.dateOnly(snapshot.effective_to) : null,
      enforcement: normRule?.kind === "HARD" ? "HARD_CAP" : "REPORT_ONLY",
    };
  }

  async getClass(schoolId: string, classId: string) {
    const result = await this.pool.query<ClassRow>(
      `SELECT id::text, school_id::text, code, name, grade, status, created_at, updated_at
         FROM classes
        WHERE id = $1 AND school_id = $2`,
      [classId, schoolId],
    );
    const classRow = result.rows[0];
    if (!classRow) throw this.notFound("CLASS_NOT_FOUND", "Lớp không tồn tại trong school scope.");
    return this.toClass(classRow);
  }

  async createClass(schoolId: string, dto: CreateClassDto) {
    await this.ensureSchool(schoolId);
    try {
      const result = await this.pool.query<ClassRow>(
        `INSERT INTO classes (tenant_id, school_id, code, name, grade, status)
         SELECT tenant_id, $1, $2, $3, $4, 'ACTIVE'
           FROM schools
          WHERE id = $1
         RETURNING id::text, school_id::text, code, name, grade, status, created_at, updated_at`,
        [schoolId, this.requiredText(dto.code, "code"), this.requiredText(dto.name, "name"), dto.grade],
      );
      return this.toClass(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã hoặc tên lớp đã tồn tại trong school.");
    }
  }

  async updateClass(schoolId: string, classId: string, dto: UpdateClassDto) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (dto.code !== undefined) {
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(dto.code, "code"));
    }
    if (dto.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(this.requiredText(dto.name, "name"));
    }
    if (dto.grade !== undefined) {
      updates.push(`grade = $${values.length + 1}`);
      values.push(dto.grade);
    }
    if (updates.length === 0) throw this.noFieldsToUpdate();
    values.push(classId, schoolId);
    try {
      const result = await this.pool.query<ClassRow>(
        `UPDATE classes
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND school_id = $${values.length}
        RETURNING id::text, school_id::text, code, name, grade, status, created_at, updated_at`,
        values,
      );
      const classRow = result.rows[0];
      if (!classRow) throw this.notFound("CLASS_NOT_FOUND", "Lớp không tồn tại trong school scope.");
      return this.toClass(classRow);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw this.translateDatabaseError(error, "Mã hoặc tên lớp đã tồn tại trong school.");
    }
  }

  async archiveClass(schoolId: string, classId: string) {
    const result = await this.pool.query<ClassRow>(
      `UPDATE classes
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2
      RETURNING id::text, school_id::text, code, name, grade, status, created_at, updated_at`,
      [classId, schoolId],
    );
    const classRow = result.rows[0];
    if (!classRow) throw this.notFound("CLASS_NOT_FOUND", "Lớp không tồn tại trong school scope.");
    return this.toClass(classRow);
  }

  async listSubjects(schoolId: string) {
    await this.ensureSchool(schoolId);
    const result = await this.pool.query<SubjectRow>(
      `SELECT id::text, school_id::text, code, name, status, created_at, updated_at
         FROM subjects
        WHERE school_id = $1
        ORDER BY code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toSubject(row));
  }

  async getSubject(schoolId: string, subjectId: string) {
    const result = await this.pool.query<SubjectRow>(
      `SELECT id::text, school_id::text, code, name, status, created_at, updated_at
         FROM subjects
        WHERE id = $1 AND school_id = $2`,
      [subjectId, schoolId],
    );
    const subject = result.rows[0];
    if (!subject) throw this.notFound("SUBJECT_NOT_FOUND", "Môn học không tồn tại trong school scope.");
    return this.toSubject(subject);
  }

  async createSubject(schoolId: string, dto: CreateSubjectDto) {
    await this.ensureSchool(schoolId);
    const name = this.requiredText(dto.name, "name");
    const code = this.requiredText(deriveSubjectCode(name), "code");
    try {
      const result = await this.pool.query<SubjectRow>(
        `INSERT INTO subjects (tenant_id, school_id, code, name, status)
         SELECT tenant_id, $1, $2, $3, 'ACTIVE'
           FROM schools
          WHERE id = $1
         RETURNING id::text, school_id::text, code, name, status, created_at, updated_at`,
        [schoolId, code, name],
      );
      return this.toSubject(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã hoặc tên môn học đã tồn tại trong school.");
    }
  }

  async updateSubject(schoolId: string, subjectId: string, dto: UpdateSubjectDto) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (dto.name !== undefined) {
      const name = this.requiredText(dto.name, "name");
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(deriveSubjectCode(name), "code"));
      updates.push(`name = $${values.length + 1}`);
      values.push(name);
    } else if (dto.code !== undefined) {
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(dto.code, "code"));
    }
    if (updates.length === 0) throw this.noFieldsToUpdate();
    values.push(subjectId, schoolId);
    try {
      const result = await this.pool.query<SubjectRow>(
        `UPDATE subjects
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND school_id = $${values.length}
        RETURNING id::text, school_id::text, code, name, status, created_at, updated_at`,
        values,
      );
      const subject = result.rows[0];
      if (!subject) throw this.notFound("SUBJECT_NOT_FOUND", "Môn học không tồn tại trong school scope.");
      return this.toSubject(subject);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw this.translateDatabaseError(error, "Mã hoặc tên môn học đã tồn tại trong school.");
    }
  }

  async archiveSubject(schoolId: string, subjectId: string) {
    const result = await this.pool.query<SubjectRow>(
      `UPDATE subjects
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2
      RETURNING id::text, school_id::text, code, name, status, created_at, updated_at`,
      [subjectId, schoolId],
    );
    const subject = result.rows[0];
    if (!subject) throw this.notFound("SUBJECT_NOT_FOUND", "Môn học không tồn tại trong school scope.");
    return this.toSubject(subject);
  }

  async listRooms(schoolId: string) {
    await this.ensureSchool(schoolId);
    const result = await this.pool.query<RoomRow>(
      `SELECT id::text, school_id::text, code, name, room_type, capacity, status, created_at, updated_at
         FROM rooms
        WHERE school_id = $1
        ORDER BY code`,
      [schoolId],
    );
    return result.rows.map((row) => this.toRoom(row));
  }

  async getRoom(schoolId: string, roomId: string) {
    const result = await this.pool.query<RoomRow>(
      `SELECT id::text, school_id::text, code, name, room_type, capacity, status, created_at, updated_at
         FROM rooms
        WHERE id = $1 AND school_id = $2`,
      [roomId, schoolId],
    );
    const room = result.rows[0];
    if (!room) throw this.notFound("ROOM_NOT_FOUND", "Phòng học không tồn tại trong school scope.");
    return this.toRoom(room);
  }

  async createRoom(schoolId: string, dto: CreateRoomDto) {
    await this.ensureSchool(schoolId);
    try {
      const result = await this.pool.query<RoomRow>(
        `INSERT INTO rooms (tenant_id, school_id, code, name, room_type, capacity, status)
         SELECT tenant_id, $1, $2, $3, $4, $5, 'ACTIVE'
           FROM schools
          WHERE id = $1
         RETURNING id::text, school_id::text, code, name, room_type, capacity, status, created_at, updated_at`,
        [
          schoolId,
          this.requiredText(dto.code, "code"),
          this.requiredText(dto.name, "name"),
          this.optionalText(dto.roomType),
          dto.capacity ?? null,
        ],
      );
      return this.toRoom(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã hoặc tên phòng đã tồn tại trong school.");
    }
  }

  async updateRoom(schoolId: string, roomId: string, dto: UpdateRoomDto) {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (dto.code !== undefined) {
      updates.push(`code = $${values.length + 1}`);
      values.push(this.requiredText(dto.code, "code"));
    }
    if (dto.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(this.requiredText(dto.name, "name"));
    }
    if (dto.roomType !== undefined) {
      updates.push(`room_type = $${values.length + 1}`);
      values.push(this.optionalText(dto.roomType));
    }
    if (dto.capacity !== undefined) {
      updates.push(`capacity = $${values.length + 1}`);
      values.push(dto.capacity);
    }
    if (updates.length === 0) throw this.noFieldsToUpdate();
    values.push(roomId, schoolId);
    try {
      const result = await this.pool.query<RoomRow>(
        `UPDATE rooms
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND school_id = $${values.length}
        RETURNING id::text, school_id::text, code, name, room_type, capacity, status, created_at, updated_at`,
        values,
      );
      const room = result.rows[0];
      if (!room) throw this.notFound("ROOM_NOT_FOUND", "Phòng học không tồn tại trong school scope.");
      return this.toRoom(room);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw this.translateDatabaseError(error, "Mã hoặc tên phòng đã tồn tại trong school.");
    }
  }

  async archiveRoom(schoolId: string, roomId: string) {
    const result = await this.pool.query<RoomRow>(
      `UPDATE rooms
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2
      RETURNING id::text, school_id::text, code, name, room_type, capacity, status, created_at, updated_at`,
      [roomId, schoolId],
    );
    const room = result.rows[0];
    if (!room) throw this.notFound("ROOM_NOT_FOUND", "Phòng học không tồn tại trong school scope.");
    return this.toRoom(room);
  }

  async listLessonRequirements(schoolId: string, periodId: string) {
    await this.ensureAcademicPeriod(schoolId, periodId);
    const result = await this.pool.query<LessonRequirementRow>(
      this.lessonRequirementSelect() + " WHERE school_id = $1 AND academic_period_id = $2 ORDER BY id",
      [schoolId, periodId],
    );
    return result.rows.map((row) => this.toLessonRequirement(row));
  }

  async getLessonRequirement(schoolId: string, periodId: string, lessonId: string) {
    const result = await this.pool.query<LessonRequirementRow>(
      this.lessonRequirementSelect() + " WHERE school_id = $1 AND academic_period_id = $2 AND id = $3",
      [schoolId, periodId, lessonId],
    );
    const lesson = result.rows[0];
    if (!lesson)
      throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong phạm vi khung năm học.");
    return this.toLessonRequirement(lesson);
  }

  async createLessonRequirement(schoolId: string, periodId: string, dto: CreateLessonRequirementDto) {
    const period = await this.ensureAcademicPeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể thêm phân công vào khung năm học đã lưu trữ.",
      });
    }
    const classId = this.requiredText(dto.classId, "classId");
    const subjectId = this.requiredText(dto.subjectId, "subjectId");
    const teacherId = this.requiredText(dto.teacherId, "teacherId");
    const roomId = dto.roomId === undefined ? null : this.requiredText(dto.roomId, "roomId");
    const fixedSlotId = dto.fixedSlotId === undefined ? null : this.requiredText(dto.fixedSlotId, "fixedSlotId");
    const activityType = dto.activityType ?? "LESSON";
    await this.ensureActiveReference("classes", classId, schoolId, "CLASS_NOT_FOUND", "CLASS_ARCHIVED", "Lớp");
    await this.ensureActiveReference(
      "subjects",
      subjectId,
      schoolId,
      "SUBJECT_NOT_FOUND",
      "SUBJECT_ARCHIVED",
      "Môn học",
    );
    await this.ensureActiveReference(
      "teachers",
      teacherId,
      schoolId,
      "TEACHER_NOT_FOUND",
      "TEACHER_ARCHIVED",
      "Giáo viên",
    );
    if (roomId)
      await this.ensureActiveReference("rooms", roomId, schoolId, "ROOM_NOT_FOUND", "ROOM_ARCHIVED", "Phòng học");
    if (fixedSlotId) await this.getTimeSlotRow(schoolId, periodId, fixedSlotId);
    await this.assertLessonNotDuplicate(schoolId, periodId, classId, subjectId, teacherId);
    const demandId = await this.upsertClassSubjectDemand(
      schoolId,
      periodId,
      classId,
      subjectId,
      roomId,
      fixedSlotId,
      dto.requiredSessions,
      activityType,
    );
    try {
      const result = await this.pool.query<LessonRequirementRow>(
        `INSERT INTO lesson_requirements
          (school_id, academic_period_id, class_id, subject_id, teacher_id, room_id, required_sessions,
           fixed_slot_id, activity_type, status, demand_id, assignment_source, assignment_locked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, 'MANUAL', TRUE)
         RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                   subject_id::text, teacher_id::text, room_id::text, required_sessions,
                   fixed_slot_id::text, activity_type, status, demand_id::text, assignment_source,
                   assignment_locked, assignment_run_id::text, created_at, updated_at`,
        [
          schoolId,
          periodId,
          classId,
          subjectId,
          teacherId,
          roomId,
          dto.requiredSessions,
          fixedSlotId,
          activityType,
          demandId,
        ],
      );
      return this.toLessonRequirement(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Phân công lớp/môn/giáo viên đã tồn tại trong khung năm học.");
    }
  }

  async updateLessonRequirement(schoolId: string, periodId: string, lessonId: string, dto: UpdateLessonRequirementDto) {
    const current = await this.getLessonRequirementRow(schoolId, periodId, lessonId);
    if (current.status === "ARCHIVED") {
      throw new ConflictException({
        code: "LESSON_REQUIREMENT_ARCHIVED",
        message: "Không thể sửa phân công đã lưu trữ.",
      });
    }
    const classId = dto.classId === undefined ? current.class_id : this.requiredText(dto.classId, "classId");
    const subjectId = dto.subjectId === undefined ? current.subject_id : this.requiredText(dto.subjectId, "subjectId");
    const teacherId = dto.teacherId === undefined ? current.teacher_id : this.requiredText(dto.teacherId, "teacherId");
    const roomId = dto.roomId === undefined ? current.room_id : this.requiredText(dto.roomId, "roomId");
    const fixedSlotId =
      dto.fixedSlotId === undefined ? current.fixed_slot_id : this.requiredText(dto.fixedSlotId, "fixedSlotId");
    const activityType = dto.activityType ?? current.activity_type;
    await this.ensureActiveReference("classes", classId, schoolId, "CLASS_NOT_FOUND", "CLASS_ARCHIVED", "Lớp");
    await this.ensureActiveReference(
      "subjects",
      subjectId,
      schoolId,
      "SUBJECT_NOT_FOUND",
      "SUBJECT_ARCHIVED",
      "Môn học",
    );
    await this.ensureActiveReference(
      "teachers",
      teacherId,
      schoolId,
      "TEACHER_NOT_FOUND",
      "TEACHER_ARCHIVED",
      "Giáo viên",
    );
    if (roomId)
      await this.ensureActiveReference("rooms", roomId, schoolId, "ROOM_NOT_FOUND", "ROOM_ARCHIVED", "Phòng học");
    if (fixedSlotId) await this.getTimeSlotRow(schoolId, periodId, fixedSlotId);
    await this.assertLessonNotDuplicate(schoolId, periodId, classId, subjectId, teacherId, lessonId);
    const demandId = await this.upsertClassSubjectDemand(
      schoolId,
      periodId,
      classId,
      subjectId,
      roomId,
      fixedSlotId,
      dto.requiredSessions ?? current.required_sessions,
      activityType,
    );

    const updates: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };
    if (dto.classId !== undefined) add("class_id", classId);
    if (dto.subjectId !== undefined) add("subject_id", subjectId);
    if (dto.teacherId !== undefined) add("teacher_id", teacherId);
    if (dto.roomId !== undefined) add("room_id", roomId);
    if (dto.requiredSessions !== undefined) add("required_sessions", dto.requiredSessions);
    if (dto.fixedSlotId !== undefined) add("fixed_slot_id", fixedSlotId);
    if (dto.activityType !== undefined) add("activity_type", activityType);
    if (
      current.demand_id !== demandId ||
      dto.classId !== undefined ||
      dto.subjectId !== undefined ||
      dto.requiredSessions !== undefined
    ) {
      add("demand_id", demandId);
    }
    if (updates.length === 0) throw this.noFieldsToUpdate();
    values.push(lessonId, schoolId, periodId);
    try {
      const result = await this.pool.query<LessonRequirementRow>(
        `UPDATE lesson_requirements
            SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 2}
            AND school_id = $${values.length - 1}
            AND academic_period_id = $${values.length}
        RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                  subject_id::text, teacher_id::text, room_id::text, required_sessions,
                  fixed_slot_id::text, activity_type, status, demand_id::text, assignment_source,
                  assignment_locked, assignment_run_id::text, created_at, updated_at`,
        values,
      );
      const lesson = result.rows[0];
      if (!lesson)
        throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong phạm vi khung năm học.");
      return this.toLessonRequirement(lesson);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw this.translateDatabaseError(error, "Phân công lớp/môn/giáo viên đã tồn tại trong khung năm học.");
    }
  }

  async archiveLessonRequirement(schoolId: string, periodId: string, lessonId: string) {
    const result = await this.pool.query<LessonRequirementRow>(
      `UPDATE lesson_requirements
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3
      RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                subject_id::text, teacher_id::text, room_id::text, required_sessions,
                fixed_slot_id::text, activity_type, status, created_at, updated_at`,
      [lessonId, schoolId, periodId],
    );
    const lesson = result.rows[0];
    if (!lesson)
      throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong phạm vi khung năm học.");
    return this.toLessonRequirement(lesson);
  }

  private async ensureSchool(schoolId: string) {
    const result = await this.pool.query<{ id: string }>("SELECT id::text FROM schools WHERE id = $1", [schoolId]);
    if (!result.rows[0]) {
      throw this.notFound("SCHOOL_NOT_FOUND", "School không tồn tại.");
    }
  }

  private async ensureAcademicPeriod(schoolId: string, periodId: string) {
    const period = await this.getAcademicPeriodRow(schoolId, periodId);
    return period;
  }

  private async getAcademicPeriodRow(schoolId: string, periodId: string) {
    const result = await this.pool.query<AcademicPeriodRow>(
      `SELECT id::text, tenant_id::text, school_id::text, academic_year, term_code, name,
              starts_on, ends_on, status, created_at, updated_at
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [periodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) {
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Khung năm học không tồn tại trong phạm vi trường.");
    }
    return period;
  }

  private async getTimeSlotRow(schoolId: string, periodId: string, slotId: string) {
    const result = await this.pool.query<TimeSlotRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, day, period,
              shift_code, starts_at::text, ends_at::text, created_at, updated_at
         FROM time_slots
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3`,
      [slotId, schoolId, periodId],
    );
    const slot = result.rows[0];
    if (!slot) {
      throw this.notFound("TIME_SLOT_NOT_FOUND", "Khung tiết không tồn tại trong phạm vi khung năm học.");
    }
    return slot;
  }

  private lessonRequirementSelect() {
    return `SELECT id::text, tenant_id::text, school_id::text, academic_period_id::text, class_id::text,
                   subject_id::text, teacher_id::text, room_id::text, required_sessions,
                   fixed_slot_id::text, activity_type, status, demand_id::text, assignment_source,
                   assignment_locked, assignment_run_id::text, created_at, updated_at
              FROM lesson_requirements`;
  }

  private async getLessonRequirementRow(schoolId: string, periodId: string, lessonId: string) {
    const result = await this.pool.query<LessonRequirementRow>(
      this.lessonRequirementSelect() + " WHERE school_id = $1 AND academic_period_id = $2 AND id = $3",
      [schoolId, periodId, lessonId],
    );
    const lesson = result.rows[0];
    if (!lesson)
      throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong phạm vi khung năm học.");
    return lesson;
  }

  private async ensureActiveReference(
    table: "classes" | "subjects" | "teachers" | "rooms",
    id: string,
    schoolId: string,
    notFoundCode: string,
    archivedCode: string,
    label: string,
  ) {
    const result = await this.pool.query<{ id: string; status: "ACTIVE" | "ARCHIVED" }>(
      `SELECT id::text, status FROM ${table} WHERE id = $1 AND school_id = $2`,
      [id, schoolId],
    );
    const reference = result.rows[0];
    if (!reference) throw this.notFound(notFoundCode, `${label} không tồn tại trong school scope.`);
    if (reference.status === "ARCHIVED") {
      throw new ConflictException({
        code: archivedCode,
        message: `Không thể tham chiếu ${label.toLowerCase()} đã lưu trữ.`,
      });
    }
  }

  private async upsertClassSubjectDemand(
    schoolId: string,
    periodId: string,
    classId: string,
    subjectId: string,
    roomId: string | null,
    fixedSlotId: string | null,
    requiredSessions: number,
    activityType: "LESSON" | "FLAG_CEREMONY",
  ) {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO class_subject_demands
         (tenant_id, school_id, academic_period_id, class_id, subject_id, room_id, fixed_slot_id,
          required_sessions, activity_type, status, source_ref)
       SELECT tenant_id, $1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 'MANUAL_CRUD'
         FROM academic_periods
        WHERE id = $2 AND school_id = $1
       ON CONFLICT (tenant_id, school_id, academic_period_id, class_id, subject_id, activity_type)
       DO UPDATE SET room_id = EXCLUDED.room_id,
                     fixed_slot_id = EXCLUDED.fixed_slot_id,
                     required_sessions = EXCLUDED.required_sessions,
                     status = 'ACTIVE',
                     revision = class_subject_demands.revision + 1,
                     updated_at = now()
       RETURNING id::text`,
      [schoolId, periodId, classId, subjectId, roomId, fixedSlotId, requiredSessions, activityType],
    );
    const demand = result.rows[0];
    if (!demand) throw new NotFoundException("Không thể tạo nhu cầu lớp-môn trong kỳ học.");
    return demand.id;
  }

  private async assertLessonNotDuplicate(
    schoolId: string,
    periodId: string,
    classId: string,
    subjectId: string,
    teacherId: string,
    excludeId?: string,
  ) {
    const values: unknown[] = [schoolId, periodId, classId, subjectId, teacherId];
    let query = `SELECT id::text
                   FROM lesson_requirements
                  WHERE school_id = $1
                    AND academic_period_id = $2
                    AND class_id = $3
                    AND subject_id = $4
                    AND teacher_id = $5
                    AND status = 'ACTIVE'`;
    if (excludeId) {
      values.push(excludeId);
      query += " AND id <> $6";
    }
    const result = await this.pool.query<{ id: string }>(query + " LIMIT 1", values);
    if (result.rows[0]) {
      throw new ConflictException({
        code: "DUPLICATE_LESSON_REQUIREMENT",
        message: "Phân công lớp/môn/giáo viên đã tồn tại trong khung năm học.",
      });
    }
  }

  private validateTimezone(timezone: string) {
    const normalized = this.requiredText(timezone, "timezone");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
    } catch {
      throw new BadRequestException({ code: "INVALID_TIMEZONE", message: "Múi giờ phải là múi giờ IANA hợp lệ." });
    }
    return normalized;
  }

  private validateDateRange(startsOn: string, endsOn: string) {
    const starts = Date.parse(startsOn);
    const ends = Date.parse(endsOn);
    if (Number.isNaN(starts) || Number.isNaN(ends) || ends < starts) {
      throw new BadRequestException({ code: "INVALID_DATE_RANGE", message: "endsOn phải lớn hơn hoặc bằng startsOn." });
    }
  }

  private validateClockRange(startsAt?: string | null, endsAt?: string | null) {
    if (startsAt && endsAt && this.clockToMinutes(endsAt) <= this.clockToMinutes(startsAt)) {
      throw new BadRequestException({ code: "INVALID_TIME_RANGE", message: "endsAt phải sau startsAt." });
    }
  }

  private clockToMinutes(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private requiredText(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException({ code: "REQUIRED_FIELD", message: `${field} là bắt buộc.` });
    }
    return normalized;
  }

  private optionalText(value: string | undefined) {
    if (value === undefined) return null;
    const normalized = value.trim();
    return normalized || null;
  }

  private noFieldsToUpdate() {
    return new BadRequestException({ code: "NO_FIELDS_TO_UPDATE", message: "Không có trường hợp lệ để cập nhật." });
  }

  private dateOnly(value: string | Date) {
    return String(value).slice(0, 10);
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }

  private translateDatabaseError(error: unknown, duplicateMessage: string) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return new ConflictException({ code: "DUPLICATE_RESOURCE", message: duplicateMessage });
    }
    if (code === "23503") {
      return new ConflictException({ code: "RESOURCE_REFERENCED", message: "Dữ liệu đang được tham chiếu." });
    }
    return error;
  }

  private toSchool(row: SchoolRow) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      timezone: row.timezone,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toAcademicPeriod(row: AcademicPeriodRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicYear: row.academic_year,
      termCode: row.term_code,
      name: row.name,
      startsOn: this.dateOnly(row.starts_on),
      endsOn: this.dateOnly(row.ends_on),
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toTimeSlot(row: TimeSlotRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      day: row.day,
      period: row.period,
      shiftCode: row.shift_code,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toGradeShiftConfig(row: GradeShiftConfigRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      grade: row.grade,
      mainShiftCode: row.main_shift_code,
      secondaryShiftCode: row.secondary_shift_code,
      allowSecondary: row.allow_secondary,
      flagCeremony: {
        day: 1,
        shiftCode: row.main_shift_code,
        period: row.main_shift_code === "AFTERNOON" ? 5 : 1,
      },
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toTeacher(row: TeacherRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      code: row.code,
      displayName: row.display_name,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toClass(row: ClassRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      code: row.code,
      name: row.name,
      grade: row.grade,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toHomeroomAssignment(row: HomeroomAssignmentRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      classId: row.class_id,
      classCode: row.class_code,
      className: row.class_name,
      teacherId: row.teacher_id,
      teacherCode: row.teacher_code,
      teacherName: row.teacher_name,
      weeklyReductionPeriods: row.weekly_reduction_periods,
      ruleCode: row.rule_code,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toTeacherSubjectGradeAssignment(row: TeacherSubjectGradeAssignmentRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      teacherId: row.teacher_id,
      subjectId: row.subject_id,
      grade: row.grade,
      status: row.status,
      sourceRef: row.source_ref,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toSubject(row: SubjectRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      code: row.code,
      name: row.name,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toRoom(row: RoomRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      code: row.code,
      name: row.name,
      roomType: row.room_type,
      capacity: row.capacity,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toLessonRequirement(row: LessonRequirementRow) {
    return {
      id: row.id,
      demandId: row.demand_id ?? null,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      classId: row.class_id,
      subjectId: row.subject_id,
      teacherId: row.teacher_id,
      roomId: row.room_id,
      requiredSessions: row.required_sessions,
      fixedSlotId: row.fixed_slot_id,
      activityType: row.activity_type,
      status: row.status,
      assignmentSource: row.assignment_source ?? "MANUAL",
      assignmentLocked: row.assignment_locked ?? true,
      assignmentRunId: row.assignment_run_id ?? null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
