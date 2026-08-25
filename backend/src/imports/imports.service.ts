import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";

const TEMPLATE_VERSION = "1.0";
export const MAX_WORKBOOK_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_WORKBOOK_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_WORKBOOK_SHEETS = 10;
export const MAX_WORKBOOK_ROWS = 10_000;
export const MAX_WORKBOOK_COLUMNS = 50;
export const MAX_WORKBOOK_PARSE_TIMEOUT_MS = 5_000;
const REQUIRED_COLUMNS = [
  { key: "classCode", label: "Mã lớp", aliases: ["ma lop", "class code"] },
  { key: "subjectCode", label: "Mã môn", aliases: ["ma mon", "subject code"] },
  {
    key: "teacherCode",
    label: "Mã giáo viên",
    aliases: ["ma giao vien", "ma gv", "teacher code"],
  },
  {
    key: "requiredSessions",
    label: "Số tiết",
    aliases: ["so tiet", "required sessions"],
  },
] as const;
const OPTIONAL_COLUMNS = [{ key: "roomCode", label: "Mã phòng", aliases: ["ma phong", "room code"] }] as const;

type ColumnKey = (typeof REQUIRED_COLUMNS)[number]["key"] | (typeof OPTIONAL_COLUMNS)[number]["key"];
type RawRow = Record<ColumnKey, string | number | null>;

export interface ImportIssue {
  row: number;
  field: string;
  code: string;
  message: string;
}

interface NormalizedRow {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  requiredSessions: number;
  roomId?: string;
}

interface ValidatedRow {
  id: string;
  rowNumber: number;
  raw: RawRow;
  normalized: NormalizedRow | null;
  errors: ImportIssue[];
}

interface MasterRecord {
  id: string;
  label: string;
}

interface ImportBatchRecord {
  id: string;
  school_id: string;
  original_filename: string;
  template_version: string;
  status: "PREVIEWED" | "CONFIRMED" | "REJECTED";
  row_count: number;
  valid_row_count: number;
  error_count: number;
  created_by: string;
  created_at: Date;
  confirmed_at: Date | null;
}

export interface UploadedExcelFile {
  originalname: string;
  buffer: Uint8Array;
}

type ZipEntry = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: number };
};

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Error) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

@Injectable()
export class ImportsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async preview(file: UploadedExcelFile | undefined, schoolId: string, actorId: string) {
    if (!schoolId) {
      throw new BadRequestException({
        code: "SCHOOL_REQUIRED",
        message: "schoolId là bắt buộc.",
      });
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: "FILE_REQUIRED",
        message: "Vui lòng chọn file Excel để upload.",
      });
    }

    this.assertExcelExtension(file.originalname);
    try {
      await withTimeout(
        this.preflightWorkbook(file.buffer),
        MAX_WORKBOOK_PARSE_TIMEOUT_MS,
        () =>
          new BadRequestException({
            code: "WORKBOOK_PARSE_TIMEOUT",
            message: "Không thể đọc file Excel trong thời gian cho phép.",
            timeoutMs: MAX_WORKBOOK_PARSE_TIMEOUT_MS,
          }),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "Không thể đọc file Excel. Hãy dùng đúng template .xlsx.",
      });
    }
    await this.assertSchool(schoolId);

    let parsed: { columns: string[]; rows: ValidatedRow[] };
    try {
      parsed = await withTimeout(
        this.parseAndValidate(file.buffer, schoolId),
        MAX_WORKBOOK_PARSE_TIMEOUT_MS,
        () =>
          new BadRequestException({
            code: "WORKBOOK_PARSE_TIMEOUT",
            message: "Không thể đọc file Excel trong thời gian cho phép.",
            timeoutMs: MAX_WORKBOOK_PARSE_TIMEOUT_MS,
          }),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "Không thể đọc file Excel. Hãy dùng đúng template .xlsx.",
      });
    }

    const batchId = randomUUID();
    const errors = parsed.rows.flatMap((row) => row.errors);
    const validRows = parsed.rows.filter((row) => row.errors.length === 0);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO import_batches
          (id, school_id, original_filename, template_version, status, row_count, valid_row_count, error_count, created_by)
         VALUES ($1, $2, $3, $4, 'PREVIEWED', $5, $6, $7, $8)`,
        [
          batchId,
          schoolId,
          file.originalname,
          TEMPLATE_VERSION,
          parsed.rows.length,
          validRows.length,
          errors.length,
          actorId,
        ],
      );

      for (const row of parsed.rows) {
        await client.query(
          `INSERT INTO import_rows (id, batch_id, row_number, payload, errors)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
          [row.id, batchId, row.rowNumber, JSON.stringify(row.normalized), JSON.stringify(row.errors)],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return {
      importBatchId: batchId,
      status: "PREVIEWED",
      templateVersion: TEMPLATE_VERSION,
      filename: file.originalname,
      columns: parsed.columns,
      rowCount: parsed.rows.length,
      validRowCount: validRows.length,
      errorCount: errors.length,
      canConfirm: errors.length === 0 && parsed.rows.length > 0,
      errors,
      rows: parsed.rows.map((row) => ({
        rowNumber: row.rowNumber,
        values: row.raw,
        errors: row.errors,
      })),
    };
  }

  async confirm(batchId: string, actorId: string, schoolId: string) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const batchResult = await client.query<ImportBatchRecord>(
        `SELECT id, school_id, original_filename, status, row_count, valid_row_count, error_count,
                created_by, created_at, confirmed_at
           FROM import_batches
          WHERE id = $1 AND school_id = $2
          FOR UPDATE`,
        [batchId, schoolId],
      );

      const batch = batchResult.rows[0];
      if (!batch) {
        throw new NotFoundException("Import batch không tồn tại.");
      }

      if (batch.status === "CONFIRMED") {
        await client.query("COMMIT");
        return this.buildConfirmedResponse(
          { ...batch, status: "CONFIRMED" as const },
          await this.findAudit(batch.id, schoolId),
        );
      }

      if (batch.error_count > 0 || batch.row_count === 0) {
        throw new BadRequestException({
          code: "IMPORT_HAS_ERRORS",
          message: "Không thể Confirm Import khi dữ liệu còn lỗi.",
          importBatchId: batch.id,
        });
      }

      const rows = await client.query<{ id: string; payload: NormalizedRow }>(
        `SELECT id, payload
           FROM import_rows
          WHERE batch_id = $1
          ORDER BY row_number`,
        [batch.id],
      );

      for (const row of rows.rows) {
        const payload = row.payload;
        await client.query(
          `INSERT INTO lesson_requirements
             (id, school_id, class_id, subject_id, teacher_id, required_sessions)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, batch.school_id, payload.classId, payload.subjectId, payload.teacherId, payload.requiredSessions],
        );
      }

      const confirmedAt = new Date();
      await client.query(
        `UPDATE import_batches
            SET status = 'CONFIRMED', confirmed_at = $2
          WHERE id = $1`,
        [batch.id, confirmedAt],
      );

      await client.query(
        `INSERT INTO audit_logs (school_id, action, entity_type, entity_id, actor_id, metadata)
         VALUES ($1, 'IMPORT_CONFIRMED', 'import_batch', $2, $3, $4::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          batch.school_id,
          batch.id,
          actorId,
          JSON.stringify({
            filename: batch.original_filename,
            rowCount: batch.row_count,
            validRowCount: batch.valid_row_count,
          }),
        ],
      );

      await client.query("COMMIT");
      const confirmedBatch = {
        ...batch,
        status: "CONFIRMED" as const,
        confirmed_at: confirmedAt,
      };
      return this.buildConfirmedResponse(confirmedBatch, await this.findAudit(batch.id, schoolId));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getBatch(batchId: string, schoolId: string) {
    const result = await this.pool.query<ImportBatchRecord>(
      `SELECT id, school_id, original_filename, template_version, status, row_count,
              valid_row_count, error_count, created_by, created_at, confirmed_at
         FROM import_batches
        WHERE id = $1 AND school_id = $2`,
      [batchId, schoolId],
    );
    const batch = result.rows[0];
    if (!batch) {
      throw new NotFoundException("Import batch không tồn tại.");
    }

    const rows = await this.pool.query(
      `SELECT row_number AS "rowNumber", payload AS values, errors
         FROM import_rows
        WHERE batch_id = $1
        ORDER BY row_number`,
      [batchId],
    );

    return {
      importBatchId: batch.id,
      status: batch.status,
      filename: batch.original_filename,
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      errorCount: batch.error_count,
      canConfirm: batch.status === "PREVIEWED" && batch.error_count === 0 && batch.row_count > 0,
      rows: rows.rows,
      auditLog: await this.findAudit(batch.id, schoolId),
    };
  }

  async getAudit(batchId: string, schoolId: string) {
    const batch = await this.getBatch(batchId, schoolId);
    return {
      importBatchId: batch.importBatchId,
      auditLog: batch.auditLog,
    };
  }

  private async parseAndValidate(buffer: Uint8Array, schoolId: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    this.assertWorkbookLimits(workbook);
    this.assertNoDangerousCells(workbook);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: "File Excel không có sheet dữ liệu.",
      });
    }

    const headerMap = new Map<string, number>();
    const columns: string[] = [];
    const headerRow = worksheet.getRow(1);
    for (let column = 1; column <= headerRow.cellCount; column += 1) {
      const header = this.asText(headerRow.getCell(column).value);
      if (header) {
        columns.push(header);
        headerMap.set(this.normalize(header), column);
      }
    }

    const missingColumns = REQUIRED_COLUMNS.filter(
      (column) => !column.aliases.some((alias) => headerMap.has(this.normalize(alias))),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: "File thiếu các cột bắt buộc: " + missingColumns.map((column) => column.label).join(", "),
        missingColumns: missingColumns.map((column) => column.label),
      });
    }

    const masterData = await this.loadMasterData(schoolId);
    const rows: ValidatedRow[] = [];
    const seen = new Set<string>();

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      let hasValue = false;
      for (let column = 1; column <= row.cellCount; column += 1) {
        if (this.asText(row.getCell(column).value) !== "") {
          hasValue = true;
          break;
        }
      }
      if (!hasValue) {
        continue;
      }

      const raw = {} as RawRow;
      for (const column of [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]) {
        const index = column.aliases
          .map((alias) => headerMap.get(this.normalize(alias)))
          .find((value) => value !== undefined);
        raw[column.key] = index ? this.asScalar(row.getCell(index).value) : null;
      }

      const errors: ImportIssue[] = [];
      const classCode = this.asText(raw.classCode);
      const subjectCode = this.asText(raw.subjectCode);
      const teacherCode = this.asText(raw.teacherCode);
      const roomCode = this.asText(raw.roomCode);

      if (!classCode) errors.push(this.issue(rowNumber, "Mã lớp", "REQUIRED", "Mã lớp là bắt buộc."));
      if (!subjectCode) errors.push(this.issue(rowNumber, "Mã môn", "REQUIRED", "Mã môn là bắt buộc."));
      if (!teacherCode) errors.push(this.issue(rowNumber, "Mã giáo viên", "REQUIRED", "Mã giáo viên là bắt buộc."));
      if (!this.asText(raw.requiredSessions)) {
        errors.push(this.issue(rowNumber, "Số tiết", "REQUIRED", "Số tiết là bắt buộc."));
      }

      const requiredSessions = this.toPositiveInteger(raw.requiredSessions);
      if (this.asText(raw.requiredSessions) && requiredSessions === null) {
        errors.push(this.issue(rowNumber, "Số tiết", "INVALID_NUMBER", "Dữ liệu cột Số tiết phải là số nguyên dương."));
      }

      const classId = this.lookup(masterData.classes, classCode);
      const subjectId = this.lookup(masterData.subjects, subjectCode);
      const teacherId = this.lookup(masterData.teachers, teacherCode);
      const roomId = roomCode ? this.lookup(masterData.rooms, roomCode) : undefined;

      if (classCode && !classId) {
        errors.push(this.issue(rowNumber, "Mã lớp", "UNKNOWN_REFERENCE", "Mã lớp " + classCode + " không tồn tại."));
      }
      if (subjectCode && !subjectId) {
        errors.push(this.issue(rowNumber, "Mã môn", "UNKNOWN_REFERENCE", "Mã môn " + subjectCode + " không tồn tại."));
      }
      if (teacherCode && !teacherId) {
        errors.push(
          this.issue(rowNumber, "Mã giáo viên", "UNKNOWN_REFERENCE", "Mã Giáo viên " + teacherCode + " không tồn tại."),
        );
      }
      if (roomCode && !roomId) {
        errors.push(
          this.issue(rowNumber, "Mã phòng", "UNKNOWN_REFERENCE", "Mã Phòng học " + roomCode + " không tồn tại."),
        );
      }

      const duplicateKey = [classId, subjectId, teacherId].join("|");
      if (classId && subjectId && teacherId && seen.has(duplicateKey)) {
        errors.push(this.issue(rowNumber, "Dòng", "DUPLICATE", "Dòng dữ liệu bị trùng phân công lớp/môn/giáo viên."));
      }
      if (errors.length === 0) {
        seen.add(duplicateKey);
      }

      rows.push({
        id: randomUUID(),
        rowNumber,
        raw,
        normalized:
          errors.length === 0
            ? {
                id: "",
                classId: classId as string,
                subjectId: subjectId as string,
                teacherId: teacherId as string,
                requiredSessions: requiredSessions as number,
                ...(roomId ? { roomId } : {}),
              }
            : null,
        errors,
      });
    }

    for (const row of rows) {
      if (row.normalized) {
        row.normalized.id = row.id;
      }
    }

    return { columns, rows };
  }

  private async loadMasterData(schoolId: string) {
    const [classes, subjects, teachers, rooms] = await Promise.all([
      this.pool.query<MasterRecord>(
        "SELECT id::text, name AS label FROM classes WHERE school_id = $1 AND status = 'ACTIVE'",
        [schoolId],
      ),
      this.pool.query<MasterRecord>(
        "SELECT id::text, name AS label FROM subjects WHERE school_id = $1 AND status = 'ACTIVE'",
        [schoolId],
      ),
      this.pool.query<MasterRecord>(
        "SELECT id::text, display_name AS label FROM teachers WHERE school_id = $1 AND status = 'ACTIVE'",
        [schoolId],
      ),
      this.pool.query<MasterRecord>(
        "SELECT id::text, name AS label FROM rooms WHERE school_id = $1 AND status = 'ACTIVE'",
        [schoolId],
      ),
    ]);

    return {
      classes: this.toLookup(classes.rows),
      subjects: this.toLookup(subjects.rows),
      teachers: this.toLookup(teachers.rows),
      rooms: this.toLookup(rooms.rows),
    };
  }

  private async preflightWorkbook(buffer: Uint8Array) {
    if (buffer.byteLength > MAX_WORKBOOK_SIZE_BYTES) {
      throw new BadRequestException({
        code: "WORKBOOK_TOO_LARGE",
        message: "File Excel vượt quá kích thước cho phép.",
        maxBytes: MAX_WORKBOOK_SIZE_BYTES,
      });
    }

    if (!this.hasZipSignature(buffer)) {
      throw new BadRequestException({
        code: "INVALID_FILE_SIGNATURE",
        message: "File không có chữ ký Excel hợp lệ.",
      });
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "File Excel bị hỏng hoặc không phải workbook hợp lệ.",
      });
    }

    const entries = Object.values(zip.files) as ZipEntry[];
    const uncompressedBytes = entries.reduce((total, entry) => total + (entry._data?.uncompressedSize ?? 0), 0);
    if (uncompressedBytes > MAX_WORKBOOK_UNCOMPRESSED_BYTES) {
      throw new BadRequestException({
        code: "WORKBOOK_UNSAFE_CONTENT",
        message: "Workbook giải nén vượt quá giới hạn an toàn.",
        maxUncompressedBytes: MAX_WORKBOOK_UNCOMPRESSED_BYTES,
      });
    }

    const entryNames = entries.map((entry) => entry.name);
    if (entryNames.some((name) => /(^|\/)(externalLinks?|vbaProject\.bin)(\/|$)/i.test(name))) {
      throw new BadRequestException({
        code: "WORKBOOK_UNSAFE_CONTENT",
        message: "Workbook chứa macro hoặc liên kết ngoài không được hỗ trợ.",
      });
    }

    const workbookEntry = entries.find((entry) => entry.name === "xl/workbook.xml");
    if (!workbookEntry) {
      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "Workbook thiếu cấu trúc Excel bắt buộc.",
      });
    }

    const workbookXml = await workbookEntry.async("string");
    const sheetCount = this.countMatches(workbookXml, /<(?:x:)?sheet(?:\s|>)/g);
    if (sheetCount === 0) {
      throw new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: "File Excel không có sheet dữ liệu.",
      });
    }
    if (sheetCount > MAX_WORKBOOK_SHEETS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Workbook vượt quá số sheet cho phép.",
        limit: "sheets",
        max: MAX_WORKBOOK_SHEETS,
      });
    }

    for (const entry of entries.filter((item) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(item.name))) {
      const xml = await entry.async("string");
      if (/<(?:x:)?f(?:\s|>)/i.test(xml) || /<(?:x:)?hyperlink(?:\s|>)/i.test(xml)) {
        throw new BadRequestException({
          code: "WORKBOOK_UNSAFE_CONTENT",
          message: "Workbook chứa công thức hoặc liên kết không được phép.",
        });
      }

      const rowCount = this.countMatches(xml, /<(?:x:)?row(?:\s|>)/g);
      if (rowCount > MAX_WORKBOOK_ROWS) {
        throw new BadRequestException({
          code: "WORKBOOK_LIMIT_EXCEEDED",
          message: "Workbook vượt quá số hàng cho phép.",
          limit: "rows",
          max: MAX_WORKBOOK_ROWS,
        });
      }

      let maxColumn = 0;
      for (const match of xml.matchAll(/<(?:x:)?c\b[^>]*\br="([A-Z]+)\d+"/gi)) {
        maxColumn = Math.max(maxColumn, this.columnNumber(match[1]));
      }
      if (maxColumn > MAX_WORKBOOK_COLUMNS) {
        throw new BadRequestException({
          code: "WORKBOOK_LIMIT_EXCEEDED",
          message: "Workbook vượt quá số cột cho phép.",
          limit: "columns",
          max: MAX_WORKBOOK_COLUMNS,
        });
      }
    }

    for (const entry of entries.filter((item) => /\.rels$/i.test(item.name))) {
      const xml = await entry.async("string");
      if (/relationships\/hyperlink|TargetMode\s*=\s*["']External["']/i.test(xml)) {
        throw new BadRequestException({
          code: "WORKBOOK_UNSAFE_CONTENT",
          message: "Workbook chứa liên kết ngoài không được phép.",
        });
      }
    }
  }

  private assertWorkbookLimits(workbook: ExcelJS.Workbook) {
    if (workbook.worksheets.length > MAX_WORKBOOK_SHEETS) {
      throw new BadRequestException({
        code: "WORKBOOK_LIMIT_EXCEEDED",
        message: "Workbook vượt quá số sheet cho phép.",
        limit: "sheets",
        max: MAX_WORKBOOK_SHEETS,
      });
    }

    for (const worksheet of workbook.worksheets) {
      if (worksheet.rowCount > MAX_WORKBOOK_ROWS) {
        throw new BadRequestException({
          code: "WORKBOOK_LIMIT_EXCEEDED",
          message: "Workbook vượt quá số hàng cho phép.",
          limit: "rows",
          max: MAX_WORKBOOK_ROWS,
        });
      }
      if (worksheet.columnCount > MAX_WORKBOOK_COLUMNS) {
        throw new BadRequestException({
          code: "WORKBOOK_LIMIT_EXCEEDED",
          message: "Workbook vượt quá số cột cho phép.",
          limit: "columns",
          max: MAX_WORKBOOK_COLUMNS,
        });
      }
    }
  }

  private assertNoDangerousCells(workbook: ExcelJS.Workbook) {
    for (const worksheet of workbook.worksheets) {
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const value = cell.value;
          const hasFormula =
            cell.type === ExcelJS.ValueType.Formula ||
            (typeof value === "object" && value !== null && ("formula" in value || "sharedFormula" in value));
          if (hasFormula || cell.hyperlink) {
            throw new BadRequestException({
              code: "WORKBOOK_UNSAFE_CONTENT",
              message: "Workbook chứa công thức hoặc liên kết không được phép.",
              sheet: worksheet.name,
              cell: cell.address,
            });
          }
        });
      });
    }
  }

  private hasZipSignature(buffer: Uint8Array) {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(buffer[2]) &&
      [0x04, 0x06, 0x08].includes(buffer[3])
    );
  }

  private countMatches(value: string, pattern: RegExp) {
    return value.match(pattern)?.length ?? 0;
  }

  private columnNumber(column: string) {
    return [...column.toUpperCase()].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
  }

  private async assertSchool(schoolId: string) {
    const result = await this.pool.query("SELECT 1 FROM schools WHERE id = $1", [schoolId]);
    if (result.rowCount === 0) {
      throw new NotFoundException("School không tồn tại.");
    }
  }

  private async findAudit(batchId: string, schoolId: string) {
    const result = await this.pool.query<{
      id: string;
      actor_id: string;
      action: string;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      "SELECT id, actor_id, action, metadata, created_at FROM audit_logs " +
        "WHERE school_id = $2 AND entity_type = 'import_batch' AND entity_id = $1 AND action = 'IMPORT_CONFIRMED'",
      [batchId, schoolId],
    );
    const audit = result.rows[0];
    if (!audit) {
      return null;
    }

    return {
      id: audit.id,
      action: audit.action,
      actorId: audit.actor_id,
      message: "User " + audit.actor_id + " đã import danh sách lịch học lúc " + audit.created_at.toISOString(),
      metadata: audit.metadata,
      createdAt: audit.created_at.toISOString(),
    };
  }

  private buildConfirmedResponse(
    batch: Pick<ImportBatchRecord, "id" | "original_filename" | "row_count" | "valid_row_count" | "confirmed_at"> & {
      status: "CONFIRMED";
    },
    auditLog: Awaited<ReturnType<ImportsService["findAudit"]>>,
  ) {
    return {
      importBatchId: batch.id,
      status: batch.status,
      filename: batch.original_filename,
      message: "Import thành công.",
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      confirmedAt: batch.confirmed_at?.toISOString() ?? null,
      auditLog,
    };
  }

  private assertExcelExtension(filename: string) {
    if (!/\.(xlsx|xlsm)$/i.test(filename)) {
      throw new BadRequestException({
        code: "INVALID_FILE_TYPE",
        message: "Định dạng file không hợp lệ. Chỉ hỗ trợ file Excel .xlsx hoặc .xlsm.",
      });
    }
  }

  private toLookup(records: MasterRecord[]) {
    const lookup = new Map<string, string>();
    for (const record of records) {
      lookup.set(this.normalize(record.id), record.id);
      lookup.set(this.normalize(record.label), record.id);
    }
    return lookup;
  }

  private lookup(lookup: Map<string, string>, value: string) {
    return lookup.get(this.normalize(value));
  }

  private issue(row: number, field: string, code: string, message: string): ImportIssue {
    return { row, field, code, message };
  }

  private normalize(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private asText(value: unknown) {
    const scalar = this.asScalar(value);
    return scalar === null ? "" : String(scalar).trim();
  }

  private asScalar(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      const candidate = value as {
        result?: unknown;
        text?: unknown;
        richText?: Array<{ text: string }>;
      };
      if (candidate.result !== undefined) return this.asScalar(candidate.result);
      if (candidate.text !== undefined) return this.asScalar(candidate.text);
      if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => part.text).join("");
    }
    return String(value);
  }

  private toPositiveInteger(value: unknown) {
    const text = this.asText(value);
    if (!text) return null;
    const numeric = Number(text);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }
}
