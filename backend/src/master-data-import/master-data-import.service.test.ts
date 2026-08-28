/// <reference types="jest" />

import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { Pool } from "pg";
import { MASTER_DATA_IMPORT_CONTRACT_VERSION } from "../contracts/master-data-import";
import { MasterDataImportService } from "./master-data-import.service";

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

async function workbookBuffer(sheetName: string, headers: string[], rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function createPool() {
  const query = jest.fn();
  const clientQuery = jest.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  });
  const pool = {
    query,
    connect: jest.fn(async () => ({ query: clientQuery, release: jest.fn() })),
  } as unknown as Pool;
  return { pool, query, clientQuery };
}

describe("MasterDataImportService", () => {
  it.each([
    ["class", "Classes", ["Mã lớp", "Tên lớp", "Khối"]],
    ["teacher", "Teachers", ["Mã giáo viên", "Tên giáo viên"]],
    ["subject", "Subjects", ["Tên môn"]],
    ["room", "Rooms", ["Mã phòng", "Tên phòng", "Loại phòng", "Sức chứa"]],
    ["teacherSubjectGrade", "TeacherSubjectGrades", ["Mã giáo viên", "Mã môn", "Khối", "Năm học", "Mã học kỳ"]],
    [
      "homeroom",
      "HomeroomAssignments",
      ["Mã lớp", "Mã giáo viên", "Năm học", "Mã học kỳ", "Số tiết giảm", "Mã quy định"],
    ],
  ])("builds the %s template with the published sheet contract", async (entity, sheetName, headers) => {
    const { pool, query } = createPool();
    query.mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 });
    const service = new MasterDataImportService(pool);

    const result = await service.buildTemplate(SCHOOL_ID, entity);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.workbook as never);

    expect(result.filename).toContain(`master-data-${entity}-template-v1.1.xlsx`);
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([
      sheetName,
      "TemplateGuide",
      "CodeLists",
      "Changelog",
    ]);
    expect(workbook.getWorksheet(sheetName)?.getRow(1).values).toEqual([undefined, ...headers]);
  });

  it("previews a valid class workbook as an update and stages only the preview", async () => {
    const { pool, query, clientQuery } = createPool();
    query
      .mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "class-001", code: "9A", status: "ACTIVE" }], rowCount: 1 });
    const service = new MasterDataImportService(pool);

    const result = await service.preview(
      {
        originalname: "classes.xlsx",
        buffer: await workbookBuffer("Classes", ["Mã lớp", "Tên lớp", "Khối"], [["9A", "Lớp 9A", 9]]),
      },
      SCHOOL_ID,
      "class",
      "import-user",
    );

    expect(result).toMatchObject({
      contractVersion: MASTER_DATA_IMPORT_CONTRACT_VERSION,
      entity: "class",
      rowCount: 1,
      validRowCount: 1,
      errorCount: 0,
      createCount: 0,
      updateCount: 1,
      canConfirm: true,
    });
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      status: "VALID",
      operation: "UPDATE",
      values: { code: "9A", name: "Lớp 9A", grade: 9 },
      normalized: { code: "9A", name: "Lớp 9A", grade: 9 },
    });
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO master_data_import_batches"),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO master_data_import_rows"),
      expect.any(Array),
    );
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO classes"))).toBe(false);
  });

  it("derives subject codes from the subject name when previewing a name-only workbook", async () => {
    const { pool, query } = createPool();
    query.mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 }).mockResolvedValueOnce({
      rows: [{ id: "subject-001", code: "NATURAL_SCIENCE", name: "Khoa học tự nhiên", status: "ACTIVE" }],
      rowCount: 1,
    });
    const service = new MasterDataImportService(pool);

    const result = await service.preview(
      {
        originalname: "subjects.xlsx",
        buffer: await workbookBuffer("Subjects", ["Tên môn"], [["Khoa học tự nhiên"], ["Vật lí"]]),
      },
      SCHOOL_ID,
      "subject",
      "import-user",
    );

    expect(result).toMatchObject({
      templateVersion: "1.1",
      rowCount: 2,
      validRowCount: 2,
      errorCount: 0,
      createCount: 1,
      updateCount: 1,
      canConfirm: true,
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: { name: "Khoa học tự nhiên", code: "KHTN" },
          normalized: expect.objectContaining({ code: "KHTN" }),
        }),
        expect.objectContaining({
          values: { name: "Vật lí", code: "VL" },
          normalized: expect.objectContaining({ code: "VL" }),
        }),
      ]),
    );
  });

  it("returns row-level errors for duplicate and invalid class data", async () => {
    const { pool, query } = createPool();
    query
      .mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const service = new MasterDataImportService(pool);

    const result = await service.preview(
      {
        originalname: "classes.xlsx",
        buffer: await workbookBuffer(
          "Classes",
          ["Mã lớp", "Tên lớp", "Khối"],
          [
            ["9A", "Lớp 9A", 9],
            ["9A", "Lớp 9A trùng", 13],
          ],
        ),
      },
      SCHOOL_ID,
      "class",
      "import-user",
    );

    expect(result.canConfirm).toBe(false);
    expect(result.errorCount).toBeGreaterThanOrEqual(2);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE", row: 3 }),
        expect.objectContaining({ code: "GRADE_OUT_OF_RANGE", row: 3 }),
      ]),
    );
  });

  it("rejects a workbook missing a required header before staging", async () => {
    const { pool, query } = createPool();
    query.mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 });
    const service = new MasterDataImportService(pool);

    await expect(
      service.preview(
        {
          originalname: "classes.xlsx",
          buffer: await workbookBuffer("Classes", ["Mã lớp", "Tên lớp"], [["9A", "Lớp 9A"]]),
        },
        SCHOOL_ID,
        "class",
        "import-user",
      ),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      response: expect.objectContaining({ code: "INVALID_TEMPLATE", missingColumns: ["Khối"] }),
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("confirms an idempotent class update and writes the import audit record", async () => {
    const { pool } = createPool();
    const clientQuery = jest.fn();
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("FROM master_data_import_batches")) {
        return {
          rows: [
            {
              id: "batch-001",
              tenant_id: "tenant-001",
              school_id: SCHOOL_ID,
              entity: "class",
              original_filename: "classes.xlsx",
              contract_version: MASTER_DATA_IMPORT_CONTRACT_VERSION,
              template_version: "1.0",
              file_checksum: "a".repeat(64),
              idempotency_key: "token-001",
              status: "PREVIEWED",
              row_count: 1,
              valid_row_count: 1,
              error_count: 0,
              warning_count: 0,
              create_count: 0,
              update_count: 1,
              created_by: "import-user",
              created_at: new Date("2026-08-27T00:00:00.000Z"),
              confirmed_by: null,
              confirmed_at: null,
              confirmation_result: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM master_data_import_rows")) {
        return {
          rows: [
            {
              id: "row-001",
              rowNumber: 2,
              operation: "UPDATE",
              payload: { code: "9A", name: "Lớp 9A", grade: 9, existingId: "class-001" },
              errors: [],
              warnings: [],
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        return {
          rows: [
            {
              id: "audit-001",
              actor_id: "confirm-user",
              action: "IMPORT",
              metadata: { entity: "class" },
              created_at: new Date("2026-08-27T00:01:00.000Z"),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    pool.connect = jest.fn(async () => ({ query: clientQuery, release: jest.fn() })) as unknown as Pool["connect"];
    const service = new MasterDataImportService(pool);

    const result = await service.confirm("batch-001", SCHOOL_ID, "confirm-user", "token-001");

    expect(result).toMatchObject({
      status: "CONFIRMED",
      entity: "class",
      updateCount: 1,
      auditLog: { action: "IMPORT" },
    });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE classes"), [
      "Lớp 9A",
      9,
      "class-001",
      SCHOOL_ID,
    ]);
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO audit_logs"))).toHaveLength(1);
  });

  it("rejects archived references during professional assignment preview", async () => {
    const { pool, query } = createPool();
    query
      .mockResolvedValueOnce({ rows: [{ id: SCHOOL_ID }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: "teacher-archived", code: "GV-ARCHIVED", status: "ARCHIVED" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: "subject-001", code: "MATH", status: "ACTIVE" }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: "period-001", academic_year: "2026-2027", term_code: "TERM_1", status: "ACTIVE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const service = new MasterDataImportService(pool);

    const result = await service.preview(
      {
        originalname: "professional.xlsx",
        buffer: await workbookBuffer(
          "TeacherSubjectGrades",
          ["Mã giáo viên", "Mã môn", "Khối", "Năm học", "Mã học kỳ"],
          [["GV-ARCHIVED", "MATH", 9, "2026-2027", "TERM_1"]],
        ),
      },
      SCHOOL_ID,
      "teacherSubjectGrade",
      "import-user",
    );

    expect(result.canConfirm).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ARCHIVED_REFERENCE" })]));
  });

  it("rolls back the whole confirmation when a domain row changed after preview", async () => {
    const { pool } = createPool();
    const clientQuery = jest.fn();
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("FROM master_data_import_batches")) {
        return {
          rows: [
            {
              id: "batch-rollback",
              tenant_id: "tenant-001",
              school_id: SCHOOL_ID,
              entity: "class",
              original_filename: "classes.xlsx",
              contract_version: MASTER_DATA_IMPORT_CONTRACT_VERSION,
              template_version: "1.0",
              file_checksum: "b".repeat(64),
              idempotency_key: "rollback-token",
              status: "PREVIEWED",
              row_count: 1,
              valid_row_count: 1,
              error_count: 0,
              warning_count: 0,
              create_count: 0,
              update_count: 1,
              created_by: "import-user",
              created_at: new Date("2026-08-27T00:00:00.000Z"),
              confirmed_by: null,
              confirmed_at: null,
              confirmation_result: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM master_data_import_rows")) {
        return {
          rows: [
            {
              id: "row-rollback",
              rowNumber: 2,
              operation: "UPDATE",
              payload: { code: "9A", name: "Lớp 9A", grade: 9, existingId: "class-001" },
              errors: [],
              warnings: [],
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE classes")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    pool.connect = jest.fn(async () => ({ query: clientQuery, release: jest.fn() })) as unknown as Pool["connect"];
    const service = new MasterDataImportService(pool);

    await expect(service.confirm("batch-rollback", SCHOOL_ID, "confirm-user", "rollback-token")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MASTER_RECORD_CHANGED" }),
    });
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("COMMIT"))).toBe(false);
  });
});
