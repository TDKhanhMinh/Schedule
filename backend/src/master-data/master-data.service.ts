import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import { PG_POOL } from "../database/database.module";
import {
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
  school_id: string;
  academic_period_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string | null;
  required_sessions: number;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string | Date;
  updated_at: string | Date;
}

@Injectable()
export class MasterDataService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listSchools() {
    const result = await this.pool.query<SchoolRow>(
      `SELECT id::text, code, name, timezone, status, created_at, updated_at
         FROM schools
        ORDER BY code`,
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
      `SELECT id::text, school_id::text, academic_year, term_code, name,
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
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Academic period không tồn tại trong school scope.");
    }
    return this.toAcademicPeriod(period);
  }

  async createAcademicPeriod(schoolId: string, dto: CreateAcademicPeriodDto) {
    await this.ensureSchool(schoolId);
    this.validateDateRange(dto.startsOn, dto.endsOn);
    try {
      const result = await this.pool.query<AcademicPeriodRow>(
        `INSERT INTO academic_periods
          (school_id, academic_year, term_code, name, starts_on, ends_on, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
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
      throw this.translateDatabaseError(error, "Academic period đã tồn tại trong school.");
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
      throw this.translateDatabaseError(error, "Academic period đã tồn tại trong school.");
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
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Academic period không tồn tại trong school scope.");
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
        ORDER BY day, period`,
      [schoolId, periodId],
    );
    return result.rows.map((row) => this.toTimeSlot(row));
  }

  async createTimeSlot(schoolId: string, periodId: string, dto: CreateTimeSlotDto) {
    const period = await this.ensureAcademicPeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể thêm slot vào period đã archive.",
      });
    }
    this.validateClockRange(dto.startsAt, dto.endsAt);
    try {
      const result = await this.pool.query<TimeSlotRow>(
        `INSERT INTO time_slots
          (school_id, academic_period_id, day, period, shift_code, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text, school_id::text, academic_period_id::text, day, period,
                   shift_code, starts_at::text, ends_at::text, created_at, updated_at`,
        [schoolId, periodId, dto.day, dto.period, dto.shiftCode ?? null, dto.startsAt ?? null, dto.endsAt ?? null],
      );
      return this.toTimeSlot(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Time slot đã tồn tại trong academic period.");
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
      throw this.translateDatabaseError(error, "Time slot đã tồn tại trong academic period.");
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
        message: "Không thể xóa time slot đang được assignment tham chiếu.",
      });
    }

    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM time_slots
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3
      RETURNING id::text`,
      [slotId, schoolId, periodId],
    );
    if (!result.rows[0]) {
      throw this.notFound("TIME_SLOT_NOT_FOUND", "Time slot không tồn tại trong period scope.");
    }
    return { id: result.rows[0].id, deleted: true };
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
        `INSERT INTO teachers (school_id, code, display_name, status)
         VALUES ($1, $2, $3, 'ACTIVE')
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
        `INSERT INTO classes (school_id, code, name, grade, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
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
    try {
      const result = await this.pool.query<SubjectRow>(
        `INSERT INTO subjects (school_id, code, name, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         RETURNING id::text, school_id::text, code, name, status, created_at, updated_at`,
        [schoolId, this.requiredText(dto.code, "code"), this.requiredText(dto.name, "name")],
      );
      return this.toSubject(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Mã hoặc tên môn học đã tồn tại trong school.");
    }
  }

  async updateSubject(schoolId: string, subjectId: string, dto: UpdateSubjectDto) {
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
        `INSERT INTO rooms (school_id, code, name, room_type, capacity, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
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
    if (!lesson) throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong period scope.");
    return this.toLessonRequirement(lesson);
  }

  async createLessonRequirement(schoolId: string, periodId: string, dto: CreateLessonRequirementDto) {
    const period = await this.ensureAcademicPeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể thêm phân công vào period đã archive.",
      });
    }
    const classId = this.requiredText(dto.classId, "classId");
    const subjectId = this.requiredText(dto.subjectId, "subjectId");
    const teacherId = this.requiredText(dto.teacherId, "teacherId");
    const roomId = dto.roomId === undefined ? null : this.requiredText(dto.roomId, "roomId");
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
    await this.assertLessonNotDuplicate(schoolId, periodId, classId, subjectId, teacherId);
    try {
      const result = await this.pool.query<LessonRequirementRow>(
        `INSERT INTO lesson_requirements
          (school_id, academic_period_id, class_id, subject_id, teacher_id, room_id, required_sessions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
         RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                   subject_id::text, teacher_id::text, room_id::text, required_sessions,
                   status, created_at, updated_at`,
        [schoolId, periodId, classId, subjectId, teacherId, roomId, dto.requiredSessions],
      );
      return this.toLessonRequirement(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Phân công lớp/môn/giáo viên đã tồn tại trong period.");
    }
  }

  async updateLessonRequirement(schoolId: string, periodId: string, lessonId: string, dto: UpdateLessonRequirementDto) {
    const current = await this.getLessonRequirementRow(schoolId, periodId, lessonId);
    if (current.status === "ARCHIVED") {
      throw new ConflictException({
        code: "LESSON_REQUIREMENT_ARCHIVED",
        message: "Không thể sửa phân công đã archive.",
      });
    }
    const classId = dto.classId === undefined ? current.class_id : this.requiredText(dto.classId, "classId");
    const subjectId = dto.subjectId === undefined ? current.subject_id : this.requiredText(dto.subjectId, "subjectId");
    const teacherId = dto.teacherId === undefined ? current.teacher_id : this.requiredText(dto.teacherId, "teacherId");
    const roomId = dto.roomId === undefined ? current.room_id : this.requiredText(dto.roomId, "roomId");
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
    await this.assertLessonNotDuplicate(schoolId, periodId, classId, subjectId, teacherId, lessonId);

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
                  status, created_at, updated_at`,
        values,
      );
      const lesson = result.rows[0];
      if (!lesson) throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong period scope.");
      return this.toLessonRequirement(lesson);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw this.translateDatabaseError(error, "Phân công lớp/môn/giáo viên đã tồn tại trong period.");
    }
  }

  async archiveLessonRequirement(schoolId: string, periodId: string, lessonId: string) {
    const result = await this.pool.query<LessonRequirementRow>(
      `UPDATE lesson_requirements
          SET status = 'ARCHIVED', updated_at = now()
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3
      RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                subject_id::text, teacher_id::text, room_id::text, required_sessions,
                status, created_at, updated_at`,
      [lessonId, schoolId, periodId],
    );
    const lesson = result.rows[0];
    if (!lesson) throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong period scope.");
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
      `SELECT id::text, school_id::text, academic_year, term_code, name,
              starts_on, ends_on, status, created_at, updated_at
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [periodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) {
      throw this.notFound("ACADEMIC_PERIOD_NOT_FOUND", "Academic period không tồn tại trong school scope.");
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
      throw this.notFound("TIME_SLOT_NOT_FOUND", "Time slot không tồn tại trong period scope.");
    }
    return slot;
  }

  private lessonRequirementSelect() {
    return `SELECT id::text, school_id::text, academic_period_id::text, class_id::text,
                   subject_id::text, teacher_id::text, room_id::text, required_sessions,
                   status, created_at, updated_at
              FROM lesson_requirements`;
  }

  private async getLessonRequirementRow(schoolId: string, periodId: string, lessonId: string) {
    const result = await this.pool.query<LessonRequirementRow>(
      this.lessonRequirementSelect() + " WHERE school_id = $1 AND academic_period_id = $2 AND id = $3",
      [schoolId, periodId, lessonId],
    );
    const lesson = result.rows[0];
    if (!lesson) throw this.notFound("LESSON_REQUIREMENT_NOT_FOUND", "Phân công không tồn tại trong period scope.");
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
        message: `Không thể tham chiếu ${label.toLowerCase()} đã archive.`,
      });
    }
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
        message: "Phân công lớp/môn/giáo viên đã tồn tại trong academic period.",
      });
    }
  }

  private validateTimezone(timezone: string) {
    const normalized = this.requiredText(timezone, "timezone");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
    } catch {
      throw new BadRequestException({ code: "INVALID_TIMEZONE", message: "Timezone phải là IANA timezone hợp lệ." });
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
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      classId: row.class_id,
      subjectId: row.subject_id,
      teacherId: row.teacher_id,
      roomId: row.room_id,
      requiredSessions: row.required_sessions,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
