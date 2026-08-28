import { ForbiddenException } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { Pool } from "pg";
import { ScheduleExportService } from "./schedule-export.service";

const version = (overrides: Record<string, unknown> = {}) => ({
  id: "version-001",
  version_number: 7,
  status: "DRAFT",
  revision: 3,
  school_id: "school-001",
  school_code: "THCS-DEMO",
  school_name: "Trường THCS Demo",
  academic_period_id: "period-001",
  academic_period_name: "Năm học 2026-2027 · Học kỳ I",
  academic_year: "2026-2027",
  term_code: "TERM_1",
  ...overrides,
});

const assignment = {
  id: "assignment-001",
  lesson_id: "lesson-001",
  session_index: 0,
  class_code: "7A",
  class_name: "7A",
  teacher_code: "GV-001",
  teacher_name: "Nguyễn An",
  subject_code: "MATH",
  subject_name: "Toán",
  room_code: "P-A",
  room_name: "Phòng A",
  day: 2,
  period: 1,
  shift_code: "MORNING",
  starts_at: "07:00",
  ends_at: "07:45",
};

describe("ScheduleExportService", () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  let service: ScheduleExportService;

  beforeEach(() => {
    query.mockReset();
    service = new ScheduleExportService(pool);
  });

  it("builds a Unicode workbook with all views and snapshot reconciliation", async () => {
    query
      .mockResolvedValueOnce({ rows: [version()] })
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rows: [{ required_sessions: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "class-001", code: "7A", name: "Lớp 7A" },
          { id: "class-002", code: "7B", name: "Lớp 7B" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ class_id: "class-001", teacher_name: "Nguyễn An" }] })
      .mockResolvedValueOnce({ rows: [{ assignment_count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.build("school-001", "version-001", "scheduler-001", "SCHEDULER");

    expect(result.filename).toBe("school-timetable-v7-draft-export.xlsx");
    expect(result.metadata).toMatchObject({
      contractVersion: "SCHEDULE-EXPORT-1.0.0",
      snapshotAssignmentCount: 1,
      requiredLessonSessions: 1,
      snapshotReconciles: true,
      hardConstraintCheck: "PASSED",
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Metadata & Summary",
      "Toàn trường",
      "Theo lớp",
      "Theo giáo viên",
      "Theo phòng",
    ]);
    expect(workbook.getWorksheet("Metadata & Summary")?.getCell("B3").value).toBe("SCHEDULE-EXPORT-1.0.0");
    expect(workbook.getWorksheet("Toàn trường")?.rowCount).toBe(64);
    expect(workbook.getWorksheet("Toàn trường")?.getRow(3).getCell(4).value).toBe("Lớp 7A");
    expect(workbook.getWorksheet("Toàn trường")?.getRow(4).getCell(4).value).toBe("Chào cờ");
    expect(workbook.getWorksheet("Toàn trường")?.getRow(4).getCell(5).value).toBe("Chào cờ");
    expect(workbook.getWorksheet("Toàn trường")?.getRow(64).getCell(1).value).toBe("GVCN");
    expect(workbook.getWorksheet("Toàn trường")?.getRow(64).getCell(5).value).toBe("Chưa có");
    expect(workbook.getWorksheet("Theo lớp")?.getRow(4).getCell(6).value).toBe("Toán");
    expect(workbook.getWorksheet("Theo giáo viên")?.getRow(4).getCell(9).value).toBe("Nguyễn An");
  });

  it("allows a viewer to export only a published version", async () => {
    query
      .mockResolvedValueOnce({ rows: [version({ status: "PUBLISHED" })] })
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rows: [{ required_sessions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ assignment_count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.build("school-001", "version-001", "viewer-001", "VIEWER", "class")).resolves.toMatchObject({
      metadata: { view: "class", scheduleVersion: { status: "PUBLISHED" } },
    });
  });

  it("blocks a viewer from exporting a draft before reading its assignments", async () => {
    query.mockResolvedValueOnce({ rows: [version()] });

    await expect(service.build("school-001", "version-001", "viewer-001", "VIEWER")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects a snapshot with server-side hard conflicts", async () => {
    query
      .mockResolvedValueOnce({ rows: [version()] })
      .mockResolvedValueOnce({ rows: [assignment] })
      .mockResolvedValueOnce({ rows: [{ required_sessions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "class-001", code: "7A", name: "7A" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ assignment_count: 1 }] })
      .mockResolvedValueOnce({
        rows: [{ kind: "TEACHER", time_slot_id: "slot-001", resource_id: "teacher-001", occurrences: 2 }],
      });

    await expect(service.build("school-001", "version-001", "scheduler-001", "SCHEDULER")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SCHEDULE_EXPORT_SNAPSHOT_INVALID", gate: "HARD_CONSTRAINTS" }),
    });
  });

  it("escapes formula-like user data before placing it in an Excel cell", async () => {
    query
      .mockResolvedValueOnce({ rows: [version({ status: "PUBLISHED" })] })
      .mockResolvedValueOnce({ rows: [assignment, { ...assignment, subject_name: '=HYPERLINK("https://evil")' }] })
      .mockResolvedValueOnce({ rows: [{ required_sessions: 2 }] })
      .mockResolvedValueOnce({ rows: [{ assignment_count: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.build("school-001", "version-001", "scheduler-001", "SCHEDULER", "class");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);

    expect(workbook.getWorksheet("Theo lớp")?.getRow(5).getCell(6).value).toBe('\'=HYPERLINK("https://evil")');
  });
});
