/// <reference types="jest" />

import ExcelJS from "exceljs";
import { BadRequestException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";
import {
  ImportsService,
  MAX_WORKBOOK_COLUMNS,
  MAX_WORKBOOK_PARSE_TIMEOUT_MS,
  MAX_WORKBOOK_ROWS,
  MAX_WORKBOOK_SIZE_BYTES,
  MAX_WORKBOOK_SHEETS,
  withTimeout,
} from "./imports.service";

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const FIXTURES_DIR = resolve(__dirname, "../../solver/examples/import-fixtures");

function createPoolMock() {
  const clientQueries: string[] = [];
  const clientQuery = jest.fn(async (sql: string) => {
    clientQueries.push(sql);
    return { rows: [], rowCount: 1 };
  });
  const poolQuery = jest.fn(async (sql: string) => {
    if (sql.includes("SELECT 1 FROM schools")) return { rows: [{ exists: 1 }], rowCount: 1 };
    if (sql.includes("FROM classes"))
      return {
        rows: [
          { id: "class-7a", label: "7A" },
          { id: "00000000-0000-0000-0000-000000000201", label: "7A" },
          { id: "00000000-0000-0000-0000-000000000202", label: "7B" },
        ],
        rowCount: 3,
      };
    if (sql.includes("FROM subjects"))
      return {
        rows: [
          { id: "subject-math", label: "Toán" },
          { id: "00000000-0000-0000-0000-000000000401", label: "Toán" },
          { id: "00000000-0000-0000-0000-000000000402", label: "Vật lý" },
          { id: "00000000-0000-0000-0000-000000000403", label: "Ngữ văn" },
        ],
        rowCount: 4,
      };
    if (sql.includes("FROM teachers"))
      return {
        rows: [
          { id: "teacher-an", label: "Nguyễn An" },
          { id: "00000000-0000-0000-0000-000000000301", label: "Nguyễn An" },
          { id: "00000000-0000-0000-0000-000000000302", label: "Trần Bình" },
        ],
        rowCount: 3,
      };
    if (sql.includes("FROM rooms"))
      return {
        rows: [
          { id: "room-a", label: "Phòng A" },
          { id: "00000000-0000-0000-0000-000000000501", label: "Phòng A" },
          { id: "00000000-0000-0000-0000-000000000502", label: "Phòng B" },
        ],
        rowCount: 3,
      };
    return { rows: [], rowCount: 0 };
  });
  const pool = {
    query: poolQuery,
    connect: jest.fn(async () => ({ query: clientQuery, release: jest.fn() })),
  } as unknown as Pool;
  return { pool, clientQuery, clientQueries };
}

async function workbookBuffer(
  options: {
    extraSheets?: number;
    extraColumns?: number;
    dataRows?: number;
    formula?: boolean;
    hyperlink?: boolean;
  } = {},
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("LessonRequirements");
  const headers = ["Mã lớp", "Mã môn", "Mã giáo viên", "Số tiết", "Mã phòng"];
  for (let column = 0; column < (options.extraColumns ?? 0); column += 1) {
    headers.push(`Extra ${column + 1}`);
  }
  worksheet.addRow(headers);
  const dataRows = options.dataRows ?? 1;
  for (let row = 0; row < dataRows; row += 1) {
    worksheet.addRow(["7A", "Toán", "Nguyễn An", 2, "Phòng A"]);
  }
  if (options.formula) worksheet.getCell("D2").value = { formula: "1+1", result: 2 } as never;
  if (options.hyperlink) worksheet.getCell("A2").value = { text: "7A", hyperlink: "https://example.com" } as never;
  for (let sheet = 0; sheet < (options.extraSheets ?? 0); sheet += 1) {
    workbook.addWorksheet(`Extra${sheet + 1}`);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function fixtureBuffer(filename: string) {
  return readFile(resolve(FIXTURES_DIR, filename));
}

function expectBadRequest(error: unknown, code: string) {
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toEqual(expect.objectContaining({ code }));
}

function createConfirmPoolMock(options: { failOnLessonInsert?: boolean } = {}) {
  const batch = {
    id: "00000000-0000-0000-0000-000000009001",
    school_id: SCHOOL_ID,
    original_filename: "valid.xlsx",
    template_version: "1.0",
    file_checksum: "a".repeat(64),
    idempotency_key: "import-token-001",
    status: "PREVIEWED" as "PREVIEWED" | "CONFIRMED",
    row_count: 1,
    valid_row_count: 1,
    error_count: 0,
    created_by: "preview-user",
    created_at: new Date("2026-08-25T02:00:00.000Z"),
    confirmed_by: null as string | null,
    confirmed_at: null as Date | null,
    confirmation_result: null as Record<string, unknown> | null,
  };
  const audit = {
    id: "00000000-0000-0000-0000-000000009101",
    actor_id: "confirm-user",
    action: "IMPORT_CONFIRMED",
    metadata: { filename: "valid.xlsx", fileChecksum: batch.file_checksum, templateVersion: "1.0" },
    created_at: new Date("2026-08-25T02:01:00.000Z"),
  };
  const clientQueries: string[] = [];
  const clientQuery = jest.fn(async (sql: string, params?: unknown[]) => {
    clientQueries.push(sql);
    if (options.failOnLessonInsert && sql.includes("INSERT INTO lesson_requirements")) {
      throw new Error("simulated domain write failure");
    }
    if (sql.includes("SELECT id, school_id") && sql.includes("WHERE id = $1 AND school_id = $2")) {
      return { rows: [batch], rowCount: 1 };
    }
    if (sql.includes("SELECT id") && sql.includes("idempotency_key = $2")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT id, payload")) {
      return {
        rows: [
          {
            id: "00000000-0000-0000-0000-000000009201",
            payload: {
              id: "00000000-0000-0000-0000-000000009201",
              classId: "00000000-0000-0000-0000-000000000201",
              subjectId: "00000000-0000-0000-0000-000000000401",
              teacherId: "00000000-0000-0000-0000-000000000301",
              requiredSessions: 2,
            },
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("SET status = 'CONFIRMED'")) {
      batch.status = "CONFIRMED";
      batch.confirmed_at = params?.[1] as Date;
      batch.confirmed_by = params?.[2] as string;
    }
    if (sql.includes("SET confirmation_result")) {
      batch.confirmation_result = JSON.parse(String(params?.[1]));
    }
    if (sql.includes("INSERT INTO audit_logs")) return { rows: [audit], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const pool = {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: jest.fn(async () => ({ query: clientQuery, release: jest.fn() })),
  } as unknown as Pool;
  return { pool, batch, clientQueries };
}

function createErrorReportPoolMock() {
  const pool = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("FROM import_batches")) return { rows: [{ id: "batch-error-001" }], rowCount: 1 };
      if (sql.includes("FROM import_rows")) {
        return {
          rows: [
            {
              row_number: 2,
              errors: [
                {
                  sheet: "LessonRequirements",
                  row: 2,
                  column: "D",
                  cell: "D2",
                  field: "Số tiết",
                  code: "INVALID_NUMBER",
                  severity: "ERROR",
                  message: "Dữ liệu cột Số tiết phải là số nguyên dương.",
                  value: "001x",
                },
              ],
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as Pool;
  return pool;
}

describe("ImportsService secure workbook boundary", () => {
  it("parses a valid workbook and stages only import rows before confirm", async () => {
    const { pool, clientQueries } = createPoolMock();
    const service = new ImportsService(pool);

    const result = await service.preview(
      { originalname: "valid.xlsx", buffer: await workbookBuffer() },
      SCHOOL_ID,
      "security-test-user",
    );

    expect(result).toMatchObject({
      templateVersion: "1.0",
      fileChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      importToken: expect.any(String),
      rowCount: 1,
      validRowCount: 1,
      errorCount: 0,
      warningCount: 0,
      canConfirm: true,
      sheetSummaries: [
        {
          sheet: "LessonRequirements",
          index: 1,
          status: "IMPORTED",
          rowCount: 1,
          validRowCount: 1,
          warningCount: 0,
          errorCount: 0,
        },
      ],
    });
    expect(result.columnMappings).toEqual([
      { column: "A", header: "Mã lớp", field: "classCode", required: true },
      { column: "B", header: "Mã môn", field: "subjectCode", required: true },
      { column: "C", header: "Mã giáo viên", field: "teacherCode", required: true },
      { column: "D", header: "Số tiết", field: "requiredSessions", required: true },
      { column: "E", header: "Mã phòng", field: "roomCode", required: false },
    ]);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      status: "VALID",
      normalized: expect.objectContaining({
        classId: "00000000-0000-0000-0000-000000000201",
        subjectId: "00000000-0000-0000-0000-000000000401",
        teacherId: "00000000-0000-0000-0000-000000000301",
      }),
      warnings: [],
      errors: [],
    });
    expect(clientQueries.some((sql) => sql.includes("lesson_requirements"))).toBe(false);
  });

  it.each([
    ["missing-value.xlsx", "REQUIRED", "A", "A2"],
    ["wrong-number.xlsx", "INVALID_NUMBER", "D", "D2"],
    ["unknown-master-data.xlsx", "UNKNOWN_REFERENCE", "C", "C2"],
  ])("returns stable row/sheet/column metadata for %s", async (filename, code, column, cell) => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    const result = await service.preview(
      { originalname: filename, buffer: await fixtureBuffer(filename) },
      SCHOOL_ID,
      "fixture-user",
    );

    expect(result).toMatchObject({ rowCount: 1, validRowCount: 0, canConfirm: false });
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, status: "INVALID", normalized: null });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: "LessonRequirements",
          row: 2,
          column,
          cell,
          code,
          severity: "ERROR",
        }),
      ]),
    );
  });

  it("accepts legacy aliases and preserves Unicode values", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    const result = await service.preview(
      { originalname: "legacy.xlsx", buffer: await fixtureBuffer("legacy.xlsx") },
      SCHOOL_ID,
      "legacy-user",
    );

    expect(result).toMatchObject({ rowCount: 1, validRowCount: 1, errorCount: 0, canConfirm: true });
    expect(result.rows[0]).toMatchObject({
      values: {
        classCode: "7A",
        subjectCode: "Toán",
        teacherCode: "Nguyễn An",
        requiredSessions: "2",
        roomCode: "Phòng A",
      },
      normalized: expect.objectContaining({ requiredSessions: 2 }),
    });
  });

  it("generates a scoped Excel error report with source coordinates and original values", async () => {
    const service = new ImportsService(createErrorReportPoolMock());
    const report = await service.buildErrorReport("batch-error-001", SCHOOL_ID);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(report as never);

    const worksheet = workbook.getWorksheet("ImportErrors");
    expect(worksheet).toBeDefined();
    if (!worksheet) throw new Error("ImportErrors sheet is missing");
    const rowValues = (row: { values: unknown }) => Array.from(row.values as unknown[]).slice(1);
    expect(rowValues(worksheet.getRow(1))).toEqual([
      "Sheet",
      "Row",
      "Column",
      "Cell",
      "Field",
      "Code",
      "Severity",
      "Message",
      "Original Value",
    ]);
    expect(rowValues(worksheet.getRow(2))).toEqual([
      "LessonRequirements",
      2,
      "D",
      "D2",
      "Số tiết",
      "INVALID_NUMBER",
      "ERROR",
      "Dữ liệu cột Số tiết phải là số nguyên dương.",
      "001x",
    ]);
  });

  it("marks duplicate natural keys as invalid with a range reference", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    const result = await service.preview(
      { originalname: "duplicate.xlsx", buffer: await fixtureBuffer("duplicate.xlsx") },
      SCHOOL_ID,
      "duplicate-user",
    );

    expect(result.rows[1]).toMatchObject({ rowNumber: 3, status: "INVALID", normalized: null });
    expect(result.rows[1].errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE", column: "A, B, C", cell: "A3, B3, C3" })]),
    );
  });

  it("rejects a missing required column with a stable template error", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview(
        { originalname: "missing-required-column.xlsx", buffer: await fixtureBuffer("missing-required-column.xlsx") },
        SCHOOL_ID,
        "template-user",
      );
      throw new Error("expected missing column rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_TEMPLATE", missingColumns: ["Mã giáo viên"] }),
      );
    }
  });

  it("rejects an Excel-like filename with an invalid magic signature", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview({ originalname: "fake.xlsx", buffer: Buffer.from("not an xlsx") }, SCHOOL_ID, "user");
      throw new Error("expected invalid signature rejection");
    } catch (error) {
      expectBadRequest(error, "INVALID_FILE_SIGNATURE");
    }
  });

  it("rejects a corrupt ZIP payload with a valid ZIP signature", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview(
        { originalname: "corrupt.xlsx", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) },
        SCHOOL_ID,
        "user",
      );
      throw new Error("expected corrupt workbook rejection");
    } catch (error) {
      expectBadRequest(error, "INVALID_WORKBOOK");
    }
  });

  it("rejects a workbook larger than the service limit", async () => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview(
        { originalname: "large.xlsx", buffer: Buffer.alloc(MAX_WORKBOOK_SIZE_BYTES + 1, 0x50) },
        SCHOOL_ID,
        "user",
      );
      throw new Error("expected size rejection");
    } catch (error) {
      expectBadRequest(error, "WORKBOOK_TOO_LARGE");
    }
  });

  it.each([
    ["formula", { formula: true }],
    ["hyperlink", { hyperlink: true }],
  ])("rejects workbook content containing a %s", async (_name, options) => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview({ originalname: "unsafe.xlsx", buffer: await workbookBuffer(options) }, SCHOOL_ID, "user");
      throw new Error("expected unsafe content rejection");
    } catch (error) {
      expectBadRequest(error, "WORKBOOK_UNSAFE_CONTENT");
    }
  });

  it.each([
    ["sheets", { extraSheets: MAX_WORKBOOK_SHEETS }],
    ["columns", { extraColumns: MAX_WORKBOOK_COLUMNS - 4 }],
    ["rows", { dataRows: MAX_WORKBOOK_ROWS }],
  ])("rejects workbook exceeding the %s limit", async (_name, options) => {
    const { pool } = createPoolMock();
    const service = new ImportsService(pool);

    try {
      await service.preview(
        { originalname: "oversized-structure.xlsx", buffer: await workbookBuffer(options) },
        SCHOOL_ID,
        "user",
      );
      throw new Error("expected workbook limit rejection");
    } catch (error) {
      expectBadRequest(error, "WORKBOOK_LIMIT_EXCEEDED");
    }
  });

  it("surfaces the parse timeout as a machine-readable error", async () => {
    const timeout = new BadRequestException({
      code: "WORKBOOK_PARSE_TIMEOUT",
      timeoutMs: MAX_WORKBOOK_PARSE_TIMEOUT_MS,
    });

    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 20)), 1, () => timeout)).rejects.toBe(
      timeout,
    );
  });

  it("requires an idempotency key before opening the confirm transaction", async () => {
    const { pool } = createConfirmPoolMock();
    const service = new ImportsService(pool);

    await expect(service.confirm("batch-001", "confirm-user", SCHOOL_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "IDEMPOTENCY_KEY_REQUIRED" }),
    });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("confirms atomically and returns the persisted result on the same-key retry", async () => {
    const { pool, batch, clientQueries } = createConfirmPoolMock();
    const service = new ImportsService(pool);

    const first = await service.confirm(batch.id, "confirm-user", SCHOOL_ID, "import-token-001");
    const second = await service.confirm(batch.id, "confirm-user", SCHOOL_ID, "import-token-001");

    expect(first).toMatchObject({
      importBatchId: batch.id,
      status: "CONFIRMED",
      templateVersion: "1.0",
      fileChecksum: "a".repeat(64),
      importToken: "import-token-001",
      confirmedBy: "confirm-user",
      auditLog: expect.objectContaining({ action: "IMPORT_CONFIRMED", actorId: "confirm-user" }),
    });
    expect(second).toEqual(first);
    expect(clientQueries.filter((sql) => sql.includes("INSERT INTO lesson_requirements"))).toHaveLength(1);
    expect(clientQueries.filter((sql) => sql.includes("INSERT INTO audit_logs"))).toHaveLength(1);
    expect(clientQueries.filter((sql) => sql.includes("SET status = 'CONFIRMED'"))).toHaveLength(1);
  });

  it("rolls back every write when a domain insert fails", async () => {
    const { pool, batch, clientQueries } = createConfirmPoolMock({ failOnLessonInsert: true });
    const service = new ImportsService(pool);

    await expect(service.confirm(batch.id, "confirm-user", SCHOOL_ID, "import-token-001")).rejects.toThrow(
      "simulated domain write failure",
    );
    expect(clientQueries).toContain("ROLLBACK");
    expect(clientQueries.some((sql) => sql.includes("SET status = 'CONFIRMED'"))).toBe(false);
    expect(clientQueries.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(false);
  });
});
