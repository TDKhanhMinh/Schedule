import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import { createConflictDiagnostic, type ConflictDiagnostic } from "../contracts/conflict-catalog";

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
  catalogVersion: ConflictDiagnostic["catalogVersion"];
  sheet: string;
  row: number;
  column: string;
  cell: string;
  field: string;
  code: string;
  severity: "ERROR" | "WARNING";
  entity: ConflictDiagnostic["entity"];
  message: string;
  remediationHint: string;
  entityReferences: Record<string, string>;
  value: string | number | null;
}

type ValidationStatus = "VALID" | "WARNING" | "INVALID";

export interface ColumnMapping {
  column: string;
  header: string;
  field: string | null;
  required: boolean;
}

interface HeaderMapping {
  index: number;
  header: string;
  column: string;
}

export interface SheetPreviewSummary {
  sheet: string;
  index: number;
  status: "IMPORTED" | "IGNORED";
  rowCount: number;
  columnCount: number;
  validRowCount: number;
  warningCount: number;
  errorCount: number;
}

export interface NormalizedRow {
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
  status: ValidationStatus;
  warnings: ImportIssue[];
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
  file_checksum: string | null;
  idempotency_key: string | null;
  status: "PREVIEWED" | "CONFIRMED" | "REJECTED";
  row_count: number;
  valid_row_count: number;
  error_count: number;
  created_by: string;
  created_at: Date;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  confirmation_result: Record<string, unknown> | null;
}

export interface ImportAuditLog {
  id: string;
  action: string;
  actorId: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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

    let parsed: {
      columns: string[];
      columnMappings: ColumnMapping[];
      sheetSummaries: SheetPreviewSummary[];
      rows: ValidatedRow[];
    };
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
    const fileChecksum = createHash("sha256").update(file.buffer).digest("hex");
    const importToken = randomUUID();
    const errors = parsed.rows.flatMap((row) => row.errors);
    const warnings = parsed.rows.flatMap((row) => row.warnings);
    const validRows = parsed.rows.filter((row) => row.errors.length === 0);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO import_batches
          (tenant_id, id, school_id, original_filename, template_version, file_checksum, idempotency_key,
           status, row_count, valid_row_count, error_count, created_by)
         VALUES ((SELECT tenant_id FROM schools WHERE id = $2), $1, $2, $3, $4, $5, $6, 'PREVIEWED', $7, $8, $9, $10)`,
        [
          batchId,
          schoolId,
          file.originalname,
          TEMPLATE_VERSION,
          fileChecksum,
          importToken,
          parsed.rows.length,
          validRows.length,
          errors.length,
          actorId,
        ],
      );

      for (const row of parsed.rows) {
        await client.query(
          `INSERT INTO import_rows (tenant_id, id, batch_id, row_number, payload, errors)
           VALUES ((SELECT tenant_id FROM import_batches WHERE id = $2), $1, $2, $3, $4::jsonb, $5::jsonb)`,
          [
            row.id,
            batchId,
            row.rowNumber,
            JSON.stringify(row.normalized),
            JSON.stringify([...row.errors, ...row.warnings]),
          ],
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
      fileChecksum,
      importToken,
      filename: file.originalname,
      columns: parsed.columns,
      columnMappings: parsed.columnMappings,
      sheetSummaries: parsed.sheetSummaries,
      rowCount: parsed.rows.length,
      validRowCount: validRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      canConfirm: errors.length === 0 && parsed.rows.length > 0,
      errors,
      warnings,
      rows: parsed.rows.map((row) => ({
        rowNumber: row.rowNumber,
        values: row.raw,
        normalized: row.normalized,
        status: row.status,
        warnings: row.warnings,
        errors: row.errors,
      })),
    };
  }

  async confirm(batchId: string, actorId: string, schoolId: string, idempotencyKey?: string) {
    const normalizedIdempotencyKey = idempotencyKey?.trim();
    if (!normalizedIdempotencyKey) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key hoặc import token là bắt buộc khi Confirm Import.",
      });
    }
    if (normalizedIdempotencyKey.length > 200) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_TOO_LONG",
        message: "Idempotency-Key không được dài quá 200 ký tự.",
      });
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        schoolId + ":" + normalizedIdempotencyKey,
      ]);
      const batchResult = await client.query<ImportBatchRecord>(
        `SELECT id, school_id, original_filename, template_version, file_checksum, idempotency_key,
                status, row_count, valid_row_count, error_count, created_by, created_at,
                confirmed_by, confirmed_at, confirmation_result
           FROM import_batches
          WHERE id = $1 AND school_id = $2
          FOR UPDATE`,
        [batchId, schoolId],
      );

      const batch = batchResult.rows[0];
      if (!batch) {
        throw new NotFoundException("Import batch không tồn tại.");
      }

      if (batch.idempotency_key && batch.idempotency_key !== normalizedIdempotencyKey) {
        throw new BadRequestException({
          code: "IDEMPOTENCY_KEY_MISMATCH",
          message: "Import batch đã được gắn với một idempotency key khác.",
          importBatchId: batch.id,
        });
      }

      const keyOwnerResult = await client.query<{ id: string }>(
        `SELECT id
           FROM import_batches
          WHERE school_id = $1 AND idempotency_key = $2 AND id <> $3
          FOR UPDATE`,
        [schoolId, normalizedIdempotencyKey, batch.id],
      );
      if (keyOwnerResult.rows[0]) {
        throw new BadRequestException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key đã được sử dụng cho một import batch khác.",
          importBatchId: keyOwnerResult.rows[0].id,
        });
      }

      if (!batch.idempotency_key) {
        await client.query(
          `UPDATE import_batches
              SET idempotency_key = $2
            WHERE id = $1 AND school_id = $3 AND idempotency_key IS NULL`,
          [batch.id, normalizedIdempotencyKey, schoolId],
        );
        batch.idempotency_key = normalizedIdempotencyKey;
      }

      if (batch.status === "CONFIRMED") {
        await client.query("COMMIT");
        if (batch.confirmation_result) {
          return batch.confirmation_result;
        }
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
             (tenant_id, id, school_id, class_id, subject_id, teacher_id, required_sessions)
           VALUES ((SELECT tenant_id FROM schools WHERE id = $2), $1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, batch.school_id, payload.classId, payload.subjectId, payload.teacherId, payload.requiredSessions],
        );
      }

      const confirmedAt = new Date();
      await client.query(
        `UPDATE import_batches
            SET status = 'CONFIRMED', confirmed_at = $2, confirmed_by = $3
          WHERE id = $1`,
        [batch.id, confirmedAt, actorId],
      );

      const auditResult = await client.query<{
        id: string;
        actor_id: string;
        action: string;
        metadata: Record<string, unknown>;
        created_at: Date;
      }>(
        `INSERT INTO audit_logs (tenant_id, school_id, action, entity_type, entity_id, actor_id, metadata)
         SELECT school.tenant_id, $1, 'IMPORT_CONFIRMED', 'import_batch', $2, $3, $4::jsonb
           FROM schools school
          WHERE school.id = $1
         RETURNING id, actor_id, action, metadata, created_at`,
        [
          batch.school_id,
          batch.id,
          actorId,
          JSON.stringify({
            filename: batch.original_filename,
            fileChecksum: batch.file_checksum,
            templateVersion: batch.template_version,
            rowCount: batch.row_count,
            validRowCount: batch.valid_row_count,
            errorCount: batch.error_count,
          }),
        ],
      );

      const confirmedBatch = {
        ...batch,
        status: "CONFIRMED" as const,
        confirmed_by: actorId,
        confirmed_at: confirmedAt,
      };
      const response = this.buildConfirmedResponse(confirmedBatch, this.toAuditLog(auditResult.rows[0]));
      await client.query(
        `UPDATE import_batches
            SET confirmation_result = $2::jsonb
          WHERE id = $1`,
        [batch.id, JSON.stringify(response)],
      );

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getBatch(batchId: string, schoolId: string) {
    const result = await this.pool.query<ImportBatchRecord>(
      `SELECT id, school_id, original_filename, template_version, file_checksum, idempotency_key,
              status, row_count, valid_row_count, error_count, created_by, created_at,
              confirmed_by, confirmed_at, confirmation_result
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
      templateVersion: batch.template_version,
      fileChecksum: batch.file_checksum,
      importToken: batch.idempotency_key,
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      errorCount: batch.error_count,
      canConfirm: batch.status === "PREVIEWED" && batch.error_count === 0 && batch.row_count > 0,
      rows: rows.rows,
      auditLog: await this.findAudit(batch.id, schoolId),
    };
  }

  async buildErrorReport(batchId: string, schoolId: string) {
    const batchResult = await this.pool.query<{ id: string }>(
      `SELECT id
         FROM import_batches
        WHERE id = $1 AND school_id = $2`,
      [batchId, schoolId],
    );
    if (!batchResult.rows[0]) {
      throw new NotFoundException("Import batch không tồn tại.");
    }

    const rows = await this.pool.query<{ row_number: number; errors: unknown }>(
      `SELECT row_number, errors
         FROM import_rows
        WHERE batch_id = $1
        ORDER BY row_number`,
      [batchId],
    );
    const issues = rows.rows.flatMap((row) => (Array.isArray(row.errors) ? (row.errors as ImportIssue[]) : []));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "School Timetable Optimizer";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("ImportErrors");
    worksheet.columns = [
      { header: "Sheet", key: "sheet", width: 22 },
      { header: "Row", key: "row", width: 10 },
      { header: "Column", key: "column", width: 16 },
      { header: "Cell", key: "cell", width: 16 },
      { header: "Field", key: "field", width: 22 },
      { header: "Code", key: "code", width: 22 },
      { header: "Severity", key: "severity", width: 12 },
      { header: "Message", key: "message", width: 58 },
      { header: "Original Value", key: "value", width: 28 },
    ];
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = `A1:I${Math.max(1, issues.length + 1)}`;
    for (const issue of issues) {
      worksheet.addRow({
        sheet: issue.sheet,
        row: issue.row,
        column: issue.column,
        cell: issue.cell,
        field: issue.field,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        value: issue.value === null || issue.value === undefined ? "" : String(issue.value),
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
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

    const headerMap = new Map<string, HeaderMapping>();
    const columns: string[] = [];
    const headerEntries: HeaderMapping[] = [];
    const headerRow = worksheet.getRow(1);
    for (let column = 1; column <= headerRow.cellCount; column += 1) {
      const header = this.asText(headerRow.getCell(column).value);
      if (header) {
        columns.push(header);
        const mapping = {
          index: column,
          header,
          column: this.columnLetter(column),
        };
        headerEntries.push(mapping);
        headerMap.set(this.normalize(header), mapping);
      }
    }

    const columnDefinitions = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
    const columnMappings: ColumnMapping[] = headerEntries.map(({ header, column }) => {
      const definition = columnDefinitions.find((candidate) =>
        candidate.aliases.some((alias) => this.normalize(alias) === this.normalize(header)),
      );
      return {
        column,
        header,
        field: definition?.key ?? null,
        required: definition ? REQUIRED_COLUMNS.some((candidate) => candidate.key === definition.key) : false,
      };
    });

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
    const columnFor = (definition: (typeof columnDefinitions)[number]) =>
      definition.aliases.map((alias) => headerMap.get(this.normalize(alias))).find((mapping) => mapping)?.column ?? "—";

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
        const mapping = column.aliases
          .map((alias) => headerMap.get(this.normalize(alias)))
          .find((value) => value !== undefined);
        raw[column.key] = mapping ? this.asScalar(row.getCell(mapping.index).value) : null;
      }

      const errors: ImportIssue[] = [];
      const warnings: ImportIssue[] = [];
      const classCode = this.asText(raw.classCode);
      const subjectCode = this.asText(raw.subjectCode);
      const teacherCode = this.asText(raw.teacherCode);
      const roomCode = this.asText(raw.roomCode);

      if (!classCode)
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[0]),
            "Mã lớp",
            "REQUIRED",
            "Mã lớp là bắt buộc.",
            raw.classCode,
          ),
        );
      if (!subjectCode)
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[1]),
            "Mã môn",
            "REQUIRED",
            "Mã môn là bắt buộc.",
            raw.subjectCode,
          ),
        );
      if (!teacherCode)
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[2]),
            "Mã giáo viên",
            "REQUIRED",
            "Mã giáo viên là bắt buộc.",
            raw.teacherCode,
          ),
        );
      if (!this.asText(raw.requiredSessions)) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[3]),
            "Số tiết",
            "REQUIRED",
            "Số tiết là bắt buộc.",
            raw.requiredSessions,
          ),
        );
      }

      const requiredSessions = this.toPositiveInteger(raw.requiredSessions);
      if (this.asText(raw.requiredSessions) && requiredSessions === null) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[3]),
            "Số tiết",
            "INVALID_NUMBER",
            "Dữ liệu cột Số tiết phải là số nguyên dương.",
            raw.requiredSessions,
          ),
        );
      }

      const classId = this.lookup(masterData.classes, classCode);
      const subjectId = this.lookup(masterData.subjects, subjectCode);
      const teacherId = this.lookup(masterData.teachers, teacherCode);
      const roomId = roomCode ? this.lookup(masterData.rooms, roomCode) : undefined;

      if (classCode && !classId) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[0]),
            "Mã lớp",
            "UNKNOWN_REFERENCE",
            "Mã lớp " + classCode + " không tồn tại.",
            raw.classCode,
          ),
        );
      }
      if (subjectCode && !subjectId) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[1]),
            "Mã môn",
            "UNKNOWN_REFERENCE",
            "Mã môn " + subjectCode + " không tồn tại.",
            raw.subjectCode,
          ),
        );
      }
      if (teacherCode && !teacherId) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(REQUIRED_COLUMNS[2]),
            "Mã giáo viên",
            "UNKNOWN_REFERENCE",
            "Mã Giáo viên " + teacherCode + " không tồn tại.",
            raw.teacherCode,
          ),
        );
      }
      if (roomCode && !roomId) {
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            columnFor(OPTIONAL_COLUMNS[0]),
            "Mã phòng",
            "UNKNOWN_REFERENCE",
            "Mã Phòng học " + roomCode + " không tồn tại.",
            raw.roomCode,
          ),
        );
      }

      const duplicateKey = [classId, subjectId, teacherId].join("|");
      if (classId && subjectId && teacherId && seen.has(duplicateKey)) {
        const duplicateColumns = [REQUIRED_COLUMNS[0], REQUIRED_COLUMNS[1], REQUIRED_COLUMNS[2]].map(columnFor);
        errors.push(
          this.issue(
            worksheet.name,
            rowNumber,
            duplicateColumns.join(", "),
            "Dòng",
            "DUPLICATE",
            "Dòng dữ liệu bị trùng phân công lớp/môn/giáo viên.",
            null,
            duplicateColumns.map((column) => `${column}${rowNumber}`).join(", "),
          ),
        );
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
        status: errors.length > 0 ? "INVALID" : warnings.length > 0 ? "WARNING" : "VALID",
        warnings,
        errors,
      });
    }

    for (const row of rows) {
      if (row.normalized) {
        row.normalized.id = row.id;
      }
    }

    const sheetSummaries: SheetPreviewSummary[] = workbook.worksheets.map((sheet, index) => {
      const imported = index === 0;
      const importedRows = imported ? rows : [];
      return {
        sheet: sheet.name,
        index: index + 1,
        status: imported ? "IMPORTED" : "IGNORED",
        rowCount: imported ? rows.length : Math.max(0, sheet.actualRowCount - 1),
        columnCount: sheet.columnCount,
        validRowCount: importedRows.filter((row) => row.errors.length === 0).length,
        warningCount: importedRows.reduce((total, row) => total + row.warnings.length, 0),
        errorCount: importedRows.reduce((total, row) => total + row.errors.length, 0),
      };
    });

    return { columns, columnMappings, sheetSummaries, rows };
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

  private columnLetter(index: number) {
    let value = index;
    let result = "";
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
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

    return this.toAuditLog({
      id: audit.id,
      action: audit.action,
      actor_id: audit.actor_id,
      metadata: audit.metadata,
      created_at: audit.created_at,
    });
  }

  private toAuditLog(row: {
    id: string;
    actor_id: string;
    action: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }): ImportAuditLog {
    return {
      id: row.id,
      action: row.action,
      actorId: row.actor_id,
      message: "User " + row.actor_id + " đã import danh sách lịch học lúc " + row.created_at.toISOString(),
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    };
  }

  private buildConfirmedResponse(
    batch: Pick<
      ImportBatchRecord,
      | "id"
      | "original_filename"
      | "template_version"
      | "file_checksum"
      | "idempotency_key"
      | "row_count"
      | "valid_row_count"
      | "confirmed_by"
      | "confirmed_at"
    > & {
      status: "CONFIRMED";
    },
    auditLog: ImportAuditLog | null,
  ) {
    return {
      importBatchId: batch.id,
      status: batch.status,
      filename: batch.original_filename,
      templateVersion: batch.template_version,
      fileChecksum: batch.file_checksum,
      importToken: batch.idempotency_key,
      message: "Import thành công.",
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      confirmedBy: batch.confirmed_by,
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

  private issue(
    sheet: string,
    row: number,
    column: string,
    field: string,
    code: string,
    message: string,
    value: string | number | null,
    cell?: string,
  ): ImportIssue {
    const diagnostic = createConflictDiagnostic(code, message, {
      sheet,
      row: String(row),
      column,
      field,
    });
    return {
      ...diagnostic,
      sheet,
      row,
      column,
      cell: cell ?? (column === "—" ? "—" : `${column}${row}`),
      field,
      severity: "ERROR",
      value,
    };
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
