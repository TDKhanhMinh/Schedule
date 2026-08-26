import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { Pool } from "pg";
import type { Role } from "../auth/auth.constants";
import { PG_POOL } from "../database/database.module";
import {
  SCHEDULE_EXPORT_CONTRACT_VERSION,
  type ScheduleExportMetadata,
  type ScheduleExportSheetSummary,
  type ScheduleExportView,
} from "../contracts";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const VIEW_LABELS: Record<Exclude<ScheduleExportView, "all">, string> = {
  class: "Theo lớp",
  teacher: "Theo giáo viên",
  room: "Theo phòng",
};

interface ScheduleVersionExportRow {
  id: string;
  version_number: number;
  status: string;
  revision: number | string;
  school_id: string;
  school_code: string;
  school_name: string;
  academic_period_id: string;
  academic_period_name: string;
  academic_year: string;
  term_code: string;
}

interface AssignmentExportRow {
  id: string;
  lesson_id: string;
  session_index: number;
  class_code: string;
  class_name: string;
  teacher_code: string;
  teacher_name: string;
  subject_code: string;
  subject_name: string;
  room_code: string | null;
  room_name: string | null;
  day: number;
  period: number;
  shift_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

interface Queryable {
  query: Pool["query"];
}

export interface ScheduleExportResult {
  buffer: Buffer;
  filename: string;
  contentType: typeof XLSX_CONTENT_TYPE;
  metadata: ScheduleExportMetadata;
}

@Injectable()
export class ScheduleExportService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async build(
    schoolId: string,
    versionId: string,
    actorId: string,
    actorRole: Role,
    view: ScheduleExportView = "all",
  ): Promise<ScheduleExportResult> {
    const version = await this.loadVersion(this.pool, schoolId, versionId);
    this.assertExportPermission(version.status, actorRole);

    const [assignments, requiredLessonSessions] = await Promise.all([
      this.listAssignments(this.pool, schoolId, version),
      this.countRequiredLessonSessions(this.pool, schoolId, version.academic_period_id),
    ]);
    await this.validateSnapshotIntegrity(this.pool, schoolId, version, assignments.length);

    const generatedAt = new Date().toISOString();
    const sheetViews =
      view === "all" ? (Object.keys(VIEW_LABELS) as Array<Exclude<ScheduleExportView, "all">>) : [view];
    const sheets: ScheduleExportSheetSummary[] = sheetViews.map((sheetView) => ({
      sheet: VIEW_LABELS[sheetView],
      view: sheetView,
      assignmentCount: assignments.length,
    }));
    const metadata: ScheduleExportMetadata = {
      contractVersion: SCHEDULE_EXPORT_CONTRACT_VERSION,
      school: { id: version.school_id, code: version.school_code, name: version.school_name },
      academicPeriod: {
        id: version.academic_period_id,
        name: version.academic_period_name,
        academicYear: version.academic_year,
        termCode: version.term_code,
      },
      scheduleVersion: {
        id: version.id,
        number: version.version_number,
        status: version.status,
        revision: Number(version.revision),
      },
      generatedAt,
      generatedBy: actorId,
      generatedByRole: actorRole,
      view,
      snapshotAssignmentCount: assignments.length,
      requiredLessonSessions,
      snapshotReconciles: sheets.every((sheet) => sheet.assignmentCount === assignments.length),
      hardConstraintCheck: "PASSED",
      sheets,
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = actorId;
    workbook.lastModifiedBy = actorId;
    workbook.created = new Date(generatedAt);
    workbook.modified = new Date(generatedAt);
    workbook.properties.date1904 = false;

    this.addSummarySheet(workbook, metadata);
    for (const sheetView of sheetViews) this.addScheduleSheet(workbook, sheetView, assignments);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const safeStatus = version.status.toLowerCase();
    return {
      buffer,
      contentType: XLSX_CONTENT_TYPE,
      filename: `school-timetable-v${version.version_number}-${safeStatus}-export.xlsx`,
      metadata,
    };
  }

  private async loadVersion(client: Queryable, schoolId: string, versionId: string) {
    const result = await client.query<ScheduleVersionExportRow>(
      `SELECT version.id::text,
              version.version_number,
              version.status,
              version.revision,
              school.id::text AS school_id,
              school.code AS school_code,
              school.name AS school_name,
              period.id::text AS academic_period_id,
              period.name AS academic_period_name,
              period.academic_year,
              period.term_code
         FROM schedule_versions version
         JOIN schools school ON school.id = version.school_id
         JOIN academic_periods period
           ON period.id = version.academic_period_id
          AND period.school_id = version.school_id
        WHERE version.id = $1 AND version.school_id = $2`,
      [versionId, schoolId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException({
        code: "SCHEDULE_VERSION_NOT_FOUND",
        message: "Phiên bản thời khóa biểu không tồn tại trong phạm vi trường.",
      });
    }
    return result.rows[0];
  }

  private assertExportPermission(status: string, actorRole: Role) {
    if (actorRole === "VIEWER" && status !== "PUBLISHED") {
      throw new ForbiddenException({
        code: "SCHEDULE_EXPORT_DRAFT_FORBIDDEN",
        message: "VIEWER chỉ được xuất phiên bản thời khóa biểu PUBLISHED.",
        status,
      });
    }
  }

  private async listAssignments(client: Queryable, schoolId: string, version: ScheduleVersionExportRow) {
    const result = await client.query<AssignmentExportRow>(
      `SELECT assignment.id::text,
              assignment.lesson_id::text,
              assignment.session_index,
              class.code AS class_code,
              class.name AS class_name,
              teacher.code AS teacher_code,
              teacher.display_name AS teacher_name,
              subject.code AS subject_code,
              subject.name AS subject_name,
              room.code AS room_code,
              room.name AS room_name,
              slot.day,
              slot.period,
              slot.shift_code,
              to_char(slot.starts_at, 'HH24:MI') AS starts_at,
              to_char(slot.ends_at, 'HH24:MI') AS ends_at
         FROM schedule_assignments assignment
         JOIN lesson_requirements lesson
           ON lesson.id = assignment.lesson_id
          AND lesson.school_id = $1
          AND lesson.academic_period_id = $2
         JOIN classes class ON class.id = lesson.class_id AND class.school_id = $1
         JOIN teachers teacher ON teacher.id = lesson.teacher_id AND teacher.school_id = $1
         JOIN subjects subject ON subject.id = lesson.subject_id AND subject.school_id = $1
         JOIN time_slots slot
           ON slot.id = assignment.time_slot_id
          AND slot.school_id = $1
          AND slot.academic_period_id = $2
         LEFT JOIN rooms room ON room.id = assignment.room_id AND room.school_id = $1
        WHERE assignment.schedule_version_id = $3
        ORDER BY class.code, teacher.code, room.code NULLS LAST, slot.day, slot.period, assignment.lesson_id,
                 assignment.session_index`,
      [schoolId, version.academic_period_id, version.id],
    );
    return result.rows;
  }

  private async countRequiredLessonSessions(client: Queryable, schoolId: string, academicPeriodId: string) {
    const result = await client.query<{ required_sessions: number | string }>(
      `SELECT COALESCE(SUM(required_sessions), 0)::int AS required_sessions
         FROM lesson_requirements
        WHERE school_id = $1 AND academic_period_id = $2 AND status = 'ACTIVE'`,
      [schoolId, academicPeriodId],
    );
    return Number(result.rows[0]?.required_sessions ?? 0);
  }

  private async validateSnapshotIntegrity(
    client: Queryable,
    schoolId: string,
    version: ScheduleVersionExportRow,
    loadedAssignmentCount: number,
  ) {
    const countResult = await client.query<{ assignment_count: number | string }>(
      `SELECT COUNT(*)::int AS assignment_count
         FROM schedule_assignments
        WHERE schedule_version_id = $1`,
      [version.id],
    );
    const assignmentCount = Number(countResult.rows[0]?.assignment_count ?? 0);
    if (assignmentCount !== loadedAssignmentCount) {
      throw new ConflictException({
        code: "SCHEDULE_EXPORT_SNAPSHOT_INVALID",
        gate: "SCOPE",
        message: "Bản chụp có phân công nằm ngoài phạm vi trường hoặc khung năm học.",
        assignmentCount,
        loadedAssignmentCount,
      });
    }

    const conflicts = await client.query<{
      kind: string;
      time_slot_id: string;
      resource_id: string;
      occurrences: number | string;
    }>(
      `SELECT 'CLASS' AS kind, assignment.time_slot_id::text AS time_slot_id,
              lesson.class_id::text AS resource_id, COUNT(*)::int AS occurrences
         FROM schedule_assignments assignment
         JOIN lesson_requirements lesson ON lesson.id = assignment.lesson_id
        WHERE assignment.schedule_version_id = $1
        GROUP BY assignment.time_slot_id, lesson.class_id
       HAVING COUNT(*) > 1
        UNION ALL
       SELECT 'TEACHER' AS kind, assignment.time_slot_id::text,
              lesson.teacher_id::text, COUNT(*)::int
         FROM schedule_assignments assignment
         JOIN lesson_requirements lesson ON lesson.id = assignment.lesson_id
        WHERE assignment.schedule_version_id = $1
        GROUP BY assignment.time_slot_id, lesson.teacher_id
       HAVING COUNT(*) > 1
        UNION ALL
       SELECT 'ROOM' AS kind, assignment.time_slot_id::text,
              assignment.room_id::text, COUNT(*)::int
         FROM schedule_assignments assignment
        WHERE assignment.schedule_version_id = $1 AND assignment.room_id IS NOT NULL
        GROUP BY assignment.time_slot_id, assignment.room_id
       HAVING COUNT(*) > 1`,
      [version.id],
    );
    if (conflicts.rows.length > 0) {
      throw new ConflictException({
        code: "SCHEDULE_EXPORT_SNAPSHOT_INVALID",
        gate: "HARD_CONSTRAINTS",
        message: "Không thể xuất bản chụp còn xung đột lớp, giáo viên hoặc phòng.",
        conflicts: conflicts.rows,
      });
    }

    if (version.school_id !== schoolId) {
      throw new ConflictException({
        code: "SCHEDULE_EXPORT_SNAPSHOT_INVALID",
        gate: "SCOPE",
        message: "Bản chụp không thuộc phạm vi trường được yêu cầu.",
      });
    }
  }

  private addSummarySheet(workbook: ExcelJS.Workbook, metadata: ScheduleExportMetadata) {
    const sheet = workbook.addWorksheet("Metadata & Summary");
    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = "School Timetable Optimizer · Workbook export";
    this.styleTitle(sheet.getCell("A1"));
    sheet.addRow([]);
    const metadataRows: Array<[string, string | number | boolean]> = [
      ["Contract version", metadata.contractVersion],
      ["School", `${metadata.school.code} · ${metadata.school.name}`],
      [
        "Academic period",
        `${metadata.academicPeriod.academicYear} · ${metadata.academicPeriod.termCode} · ${metadata.academicPeriod.name}`,
      ],
      [
        "Schedule version",
        `v${metadata.scheduleVersion.number} · ${metadata.scheduleVersion.status} · ${metadata.scheduleVersion.id}`,
      ],
      ["Revision", metadata.scheduleVersion.revision],
      ["Generated at (UTC)", metadata.generatedAt],
      ["Generated by", `${metadata.generatedBy} · ${metadata.generatedByRole}`],
      ["Requested view", metadata.view],
      ["Snapshot assignments", metadata.snapshotAssignmentCount],
      ["Required lesson sessions", metadata.requiredLessonSessions],
      ["Snapshot row reconciliation", metadata.snapshotReconciles ? "PASS" : "FAIL"],
      ["Hard-constraint check", metadata.hardConstraintCheck],
    ];
    for (const [label, value] of metadataRows) {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }

    sheet.addRow([]);
    const summaryTitle = sheet.addRow(["Sheet summary"]);
    summaryTitle.font = { bold: true, color: { argb: "FF0F766E" } };
    const header = sheet.addRow(["Sheet", "View", "Assignment rows", "Reconciles to snapshot"]);
    this.styleHeader(header);
    for (const summary of metadata.sheets) {
      sheet.addRow([
        summary.sheet,
        summary.view,
        summary.assignmentCount,
        summary.assignmentCount === metadata.snapshotAssignmentCount ? "PASS" : "FAIL",
      ]);
    }
    sheet.columns = [{ width: 30 }, { width: 22 }, { width: 24 }, { width: 28 }, { width: 18 }, { width: 18 }];
    sheet.views = [{ state: "frozen", ySplit: 3 }];
  }

  private addScheduleSheet(
    workbook: ExcelJS.Workbook,
    view: Exclude<ScheduleExportView, "all">,
    assignments: AssignmentExportRow[],
  ) {
    const sheet = workbook.addWorksheet(VIEW_LABELS[view]);
    sheet.mergeCells("A1:J1");
    sheet.getCell("A1").value = `${VIEW_LABELS[view]} · lịch phân phối`;
    this.styleTitle(sheet.getCell("A1"));
    sheet.addRow([]);
    const header = sheet.addRow([
      view === "class" ? "Mã lớp" : view === "teacher" ? "Mã GV" : "Mã phòng",
      view === "class" ? "Lớp" : view === "teacher" ? "Giáo viên" : "Phòng",
      "Ngày",
      "Tiết",
      "Khung giờ",
      "Môn học",
      "Mã môn",
      "Lớp",
      "Giáo viên",
      "Phòng",
    ]);
    this.styleHeader(header);

    const sorted = [...assignments].sort((left, right) => {
      const leftResource =
        view === "class" ? left.class_code : view === "teacher" ? left.teacher_code : (left.room_code ?? "");
      const rightResource =
        view === "class" ? right.class_code : view === "teacher" ? right.teacher_code : (right.room_code ?? "");
      return (
        leftResource.localeCompare(rightResource, "vi") ||
        left.day - right.day ||
        left.period - right.period ||
        left.lesson_id.localeCompare(right.lesson_id)
      );
    });
    for (const assignment of sorted) {
      const resourceCode =
        view === "class"
          ? assignment.class_code
          : view === "teacher"
            ? assignment.teacher_code
            : (assignment.room_code ?? "—");
      const resourceName =
        view === "class"
          ? assignment.class_name
          : view === "teacher"
            ? assignment.teacher_name
            : (assignment.room_name ?? "—");
      const row = sheet.addRow([
        this.safeWorkbookValue(resourceCode),
        this.safeWorkbookValue(resourceName),
        this.safeWorkbookValue(`Thứ ${assignment.day}`),
        assignment.period,
        this.safeWorkbookValue(
          assignment.starts_at && assignment.ends_at ? `${assignment.starts_at}–${assignment.ends_at}` : "—",
        ),
        this.safeWorkbookValue(assignment.subject_name),
        this.safeWorkbookValue(assignment.subject_code),
        this.safeWorkbookValue(assignment.class_name),
        this.safeWorkbookValue(assignment.teacher_name),
        this.safeWorkbookValue(assignment.room_name ?? "—"),
      ]);
      row.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
      });
    }
    const lastRow = Math.max(sheet.rowCount, 3);
    sheet.autoFilter = { from: "A3", to: `J${lastRow}` };
    sheet.views = [{ state: "frozen", ySplit: 3 }];
    sheet.columns = [
      { width: 16 },
      { width: 24 },
      { width: 12 },
      { width: 10 },
      { width: 18 },
      { width: 24 },
      { width: 16 },
      { width: 18 },
      { width: 24 },
      { width: 18 },
    ];
  }

  private styleTitle(cell: ExcelJS.Cell) {
    cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  }

  private safeWorkbookValue(value: string) {
    return /^[=+\-@]/.test(value) ? `'${value}` : value;
  }

  private styleHeader(row: ExcelJS.Row) {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
  }
}
