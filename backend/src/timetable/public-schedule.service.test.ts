import { ConflictException, GoneException } from "@nestjs/common";
import type { Pool } from "pg";
import { PublicScheduleService } from "./public-schedule.service";

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const version = (overrides: Record<string, unknown> = {}) => ({
  id: "version-001",
  version_number: 1,
  status: "PUBLISHED",
  revision: 4,
  school_id: "school-001",
  school_code: "THCS-DEMO",
  school_name: "Trường THCS Demo",
  academic_period_id: "period-001",
  academic_period_name: "Năm học 2026-2027 · Học kỳ I",
  academic_year: "2026-2027",
  term_code: "TERM_1",
  link_expires_at: future,
  ...overrides,
});

const assignment = {
  class_code: "7A",
  class_name: "7A",
  teacher_code: "GV-001",
  teacher_name: "Nguyễn An",
  subject_code: "MATH",
  subject_name: "Toán",
  room_code: "P-A",
  room_name: "Phòng A",
  day: 1,
  period: 1,
  shift_code: "MORNING",
  starts_at: "07:00",
  ends_at: "07:45",
};

describe("PublicScheduleService", () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  let service: PublicScheduleService;

  beforeEach(() => {
    query.mockReset();
    service = new PublicScheduleService(pool);
  });

  it("creates a hashed, expiring link only for a published version", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: "version-001", status: "PUBLISHED" }] })
      .mockResolvedValueOnce({ rows: [{ id: "link-001" }] });

    const result = await service.createLink("school-001", "version-001", "reviewer-001", 48);

    expect(result).toMatchObject({
      contractVersion: "SCHEDULE-PUBLIC-LINK-1.0.0",
      id: "link-001",
      scheduleVersionId: "version-001",
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.publicPath).toBe(`/public/schedules/${result.token}`);
    expect(query.mock.calls[1][1]).toEqual([
      "school-001",
      "version-001",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
      "reviewer-001",
    ]);
  });

  it("rejects creating a public link for unpublished data", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "version-001", status: "DRAFT" }] });

    await expect(service.createLink("school-001", "version-001", "reviewer-001")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns safe filtered read-only data without internal assignment IDs", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-001" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "link-001",
            school_id: "school-001",
            schedule_version_id: "version-001",
            expires_at: future,
            revoked_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [version()] })
      .mockResolvedValueOnce({ rows: [assignment] });

    const result = await service.getPublicView("public-token", "class", "7A");

    expect(result).toMatchObject({
      contractVersion: "SCHEDULE-PUBLIC-VIEW-1.0.0",
      pdfContractVersion: "SCHEDULE-PDF-1.0.0",
      watermark: "PUBLIC READ ONLY",
      view: "class",
      resourceFilter: "7A",
      scheduleVersion: { status: "PUBLISHED" },
      assignments: [{ className: "7A", subjectName: "Toán" }],
    });
    expect(result.assignments[0]).not.toHaveProperty("lessonId");
  });

  it("renders an A4 PDF with version and read-only metadata", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-001" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "link-001",
            school_id: "school-001",
            schedule_version_id: "version-001",
            expires_at: future,
            revoked_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [version()] })
      .mockResolvedValueOnce({ rows: [assignment] });

    const result = await service.buildPdf("public-token", "teacher");

    expect(result).toMatchObject({ filename: "public-timetable-v1-teacher.pdf", contentType: "application/pdf" });
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.metadata.watermark).toBe("PUBLIC READ ONLY");
  });

  it("returns Gone for an expired or revoked link", async () => {
    query.mockResolvedValueOnce({
      rows: [{ tenant_id: "tenant-001" }],
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "link-001",
          school_id: "school-001",
          schedule_version_id: "version-001",
          expires_at: "2020-01-01T00:00:00.000Z",
          revoked_at: null,
        },
      ],
    });

    await expect(service.getPublicView("expired-token")).rejects.toBeInstanceOf(GoneException);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
