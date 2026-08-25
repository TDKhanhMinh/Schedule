/// <reference types="jest" />

import ExcelJS from "exceljs";
import { BadRequestException } from "@nestjs/common";
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

function createPoolMock() {
  const clientQueries: string[] = [];
  const clientQuery = jest.fn(async (sql: string) => {
    clientQueries.push(sql);
    return { rows: [], rowCount: 1 };
  });
  const poolQuery = jest.fn(async (sql: string) => {
    if (sql.includes("SELECT 1 FROM schools")) return { rows: [{ exists: 1 }], rowCount: 1 };
    if (sql.includes("FROM classes")) return { rows: [{ id: "class-7a", label: "7A" }], rowCount: 1 };
    if (sql.includes("FROM subjects")) return { rows: [{ id: "subject-math", label: "Toán" }], rowCount: 1 };
    if (sql.includes("FROM teachers")) return { rows: [{ id: "teacher-an", label: "Nguyễn An" }], rowCount: 1 };
    if (sql.includes("FROM rooms")) return { rows: [{ id: "room-a", label: "Phòng A" }], rowCount: 1 };
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

function expectBadRequest(error: unknown, code: string) {
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toEqual(expect.objectContaining({ code }));
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

    expect(result).toMatchObject({ rowCount: 1, validRowCount: 1, errorCount: 0, canConfirm: true });
    expect(clientQueries.some((sql) => sql.includes("lesson_requirements"))).toBe(false);
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
});
