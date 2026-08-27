import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  MASTER_DATA_IMPORT_CONTRACT_VERSION,
  MASTER_DATA_IMPORT_DEFINITIONS,
  MASTER_DATA_TEMPLATE_VERSION,
  getMasterDataImportDefinition,
  type MasterDataImportColumn,
  type MasterDataImportEntity,
  type MasterDataImportIssue,
  type MasterDataImportOperation,
  type MasterDataImportPreview,
  type MasterDataImportRowPreview,
} from "../contracts/master-data-import";
import { PG_POOL } from "../database/database.module";
import { withTimeout, type UploadedExcelFile } from "../imports/imports.service";
import {
  MAX_WORKBOOK_PARSE_TIMEOUT_MS,
  assertNoDangerousCells,
  assertWorkbookLimits,
  assertExcelExtension,
  preflightWorkbook,
} from "../imports/workbook-security";

interface CatalogRecord extends QueryResultRow {
  id: string;
  code: string;
  status: "ACTIVE" | "ARCHIVED";
  name?: string;
  display_name?: string;
  grade?: number;
  room_type?: string | null;
  capacity?: number | null;
}

interface AcademicPeriodRecord extends QueryResultRow {
  id: string;
  academic_year: string;
  term_code: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

interface ImportCatalog {
  records: Map<string, CatalogRecord>;
  teachers: Map<string, CatalogRecord>;
  classes: Map<string, CatalogRecord>;
  subjects: Map<string, CatalogRecord>;
  rooms: Map<string, CatalogRecord>;
}

interface RelationCatalog {
  teacherSubjectGrade: Map<string, { id: string; status: "ACTIVE" | "ARCHIVED" }>;
  homeroom: Map<string, { id: string; status: "ACTIVE" }>;
}

interface BatchRecord extends QueryResultRow {
  id: string;
  tenant_id: string;
  school_id: string;
  entity: MasterDataImportEntity;
  original_filename: string;
  contract_version: string;
  template_version: string;
  file_checksum: string;
  idempotency_key: string | null;
  status: "PREVIEWED" | "CONFIRMED" | "REJECTED";
  row_count: number;
  valid_row_count: number;
  error_count: number;
  warning_count: number;
  create_count: number;
  update_count: number;
  created_by: string;
  created_at: Date;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  confirmation_result: Record<string, unknown> | null;
}

interface StagedRow extends MasterDataImportRowPreview {
  id: string;
}

type Scalar = string | number | null;
type NormalizedPayload = Record<string, Scalar> & { existingId?: string };

const MASTER_ENTITY_TABLES: Record<"class" | "teacher" | "subject" | "room", string> = {
  class: "classes",
  teacher: "teachers",
  subject: "subjects",
  room: "rooms",
};

const HEADER_ALIASES: Record<string, string[]> = {
  code: ["ma lop", "ma giao vien", "ma mon", "ma phong", "class code", "teacher code", "subject code", "room code"],
  name: ["ten lop", "ten mon", "ten phong", "class name", "subject name", "room name"],
  displayName: ["ten giao vien", "ho ten", "display name", "teacher name"],
  grade: ["khoi", "grade"],
  roomType: ["loai phong", "room type"],
  capacity: ["suc chua", "capacity"],
  teacherCode: ["ma giao vien", "ma gv", "teacher code"],
  subjectCode: ["ma mon", "subject code"],
  classCode: ["ma lop", "class code"],
  academicYear: ["nam hoc", "academic year"],
  termCode: ["ma hoc ky", "hoc ky", "term code"],
  weeklyReductionPeriods: ["so tiet giam", "tiet giam", "weekly reduction periods"],
  ruleCode: ["ma quy dinh", "ma rule", "rule code"],
};

@Injectable()
export class MasterDataImportService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async buildTemplate(schoolId: string, entityValue: string) {
    const entity = this.entityFromValue(entityValue);
    await this.ensureSchool(schoolId);
    const definition = getMasterDataImportDefinition(entity)!;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Thời khóa biểu trường học - Bộ tối ưu";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(definition.sheetName);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = `A1:${this.columnLetter(definition.columns.length)}200`;
    worksheet.columns = definition.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: this.columnWidth(column),
    }));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315EFB" } };
    worksheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    this.addTemplateValidations(worksheet, definition.columns);

    const guide = workbook.addWorksheet("TemplateGuide");
    guide.columns = [
      { header: "Thuộc tính", key: "key", width: 30 },
      { header: "Giá trị", key: "value", width: 90 },
    ];
    guide.addRows([
      ["Contract version", MASTER_DATA_IMPORT_CONTRACT_VERSION],
      ["Template version", MASTER_DATA_TEMPLATE_VERSION],
      ["Entity", definition.entity],
      ["Sheet dữ liệu", definition.sheetName],
      ["Khóa tự nhiên", definition.naturalKey.join(" + ")],
      ["Nguyên tắc", "Mã mới tạo, mã tồn tại cập nhật, không tự động xóa hoặc khôi phục dữ liệu."],
      ["Ghi chú", "Xóa các dòng minh họa trước khi tải lên nếu có thêm dữ liệu thử nghiệm."],
    ]);
    guide.getRow(1).font = { bold: true };
    guide.views = [{ state: "frozen", ySplit: 1 }];

    const codeLists = workbook.addWorksheet("CodeLists");
    codeLists.columns = [
      { header: "Danh sách", key: "list", width: 28 },
      { header: "Giá trị", key: "value", width: 28 },
    ];
    for (let grade = 6; grade <= 12; grade += 1) codeLists.addRow(["Khối", grade]);
    codeLists.addRows([
      ["Mã học kỳ", "TERM_1"],
      ["Mã học kỳ", "TERM_2"],
      ["Trạng thái", "ACTIVE"],
      ["Trạng thái", "ARCHIVED"],
    ]);
    codeLists.getRow(1).font = { bold: true };

    const changelog = workbook.addWorksheet("Changelog");
    changelog.columns = [
      { header: "Phiên bản", key: "version", width: 16 },
      { header: "Ngày", key: "date", width: 16 },
      { header: "Thay đổi", key: "change", width: 80 },
    ];
    changelog.addRow([
      MASTER_DATA_TEMPLATE_VERSION,
      new Date().toISOString().slice(0, 10),
      "Phát hành template master data và phân công theo contract MASTER-DATA-IMPORT-1.0.0.",
    ]);
    changelog.getRow(1).font = { bold: true };

    return {
      filename: `master-data-${entity}-template-v${MASTER_DATA_TEMPLATE_VERSION}.xlsx`,
      workbook: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
  }

  async preview(
    file: UploadedExcelFile | undefined,
    schoolId: string,
    entityValue: string | undefined,
    actorId: string,
  ): Promise<MasterDataImportPreview> {
    const entity = this.entityFromValue(entityValue);
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: "FILE_REQUIRED", message: "Vui lòng chọn tệp Excel để tải lên." });
    }
    assertExcelExtension(file.originalname);
    await withTimeout(
      preflightWorkbook(file.buffer),
      MAX_WORKBOOK_PARSE_TIMEOUT_MS,
      () =>
        new BadRequestException({
          code: "WORKBOOK_PARSE_TIMEOUT",
          message: "Không thể đọc file Excel trong thời gian cho phép.",
        }),
    );
    await this.ensureSchool(schoolId);
    const definition = getMasterDataImportDefinition(entity)!;
    const workbook = new ExcelJS.Workbook();
    try {
      await withTimeout(
        workbook.xlsx.load(file.buffer as any),
        MAX_WORKBOOK_PARSE_TIMEOUT_MS,
        () =>
          new BadRequestException({
            code: "WORKBOOK_PARSE_TIMEOUT",
            message: "Không thể đọc file Excel trong thời gian cho phép.",
          }),
      );
      assertWorkbookLimits(workbook);
      assertNoDangerousCells(workbook);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "Không thể đọc tệp Excel. Hãy dùng đúng mẫu .xlsx.",
      });
    }

    const worksheet = workbook.getWorksheet(definition.sheetName) ?? workbook.worksheets[0];
    if (!worksheet || worksheet.name !== definition.sheetName) {
      throw new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: `Tệp phải có trang tính ${definition.sheetName}.`,
        expectedSheet: definition.sheetName,
      });
    }
    const { mappings, indexedMappings, missingColumns } = this.headerMappings(worksheet, definition.columns);
    if (missingColumns.length > 0) {
      throw new BadRequestException({
        code: "INVALID_TEMPLATE",
        message: "Tệp thiếu các cột bắt buộc.",
        missingColumns,
      });
    }

    const catalog = await this.loadCatalog(schoolId, entity);
    const periods =
      entity === "teacherSubjectGrade" || entity === "homeroom"
        ? await this.loadPeriods(schoolId)
        : new Map<string, AcademicPeriodRecord>();
    const relations =
      entity === "teacherSubjectGrade" || entity === "homeroom"
        ? await this.loadRelationCatalog(schoolId)
        : this.emptyRelationCatalog();
    const rows: StagedRow[] = [];
    const seenKeys = new Set<string>();
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.number === 1 || !this.rowHasValues(row, indexedMappings)) return;
      const values = this.readValues(row, indexedMappings);
      const result = this.validateRow(
        entity,
        definition.columns,
        values,
        catalog,
        periods,
        relations,
        seenKeys,
        row.number,
      );
      rows.push({ id: randomUUID(), rowNumber: row.number, ...result });
    });

    const errors = rows.flatMap((row) => row.errors);
    const warnings = rows.flatMap((row) => row.warnings);
    const validRows = rows.filter((row) => row.errors.length === 0);
    const fileChecksum = createHash("sha256").update(file.buffer).digest("hex");
    const importBatchId = randomUUID();
    const importToken = randomUUID();
    await this.stageBatch({
      id: importBatchId,
      schoolId,
      entity,
      filename: file.originalname,
      checksum: fileChecksum,
      importToken,
      actorId,
      rows,
      rowCount: rows.length,
      validRowCount: validRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      createCount: validRows.filter((row) => row.operation === "CREATE").length,
      updateCount: validRows.filter((row) => row.operation === "UPDATE").length,
    });

    return {
      contractVersion: MASTER_DATA_IMPORT_CONTRACT_VERSION,
      templateVersion: MASTER_DATA_TEMPLATE_VERSION,
      entity,
      label: definition.label,
      sheetName: definition.sheetName,
      filename: file.originalname,
      fileChecksum,
      importBatchId,
      importToken,
      rowCount: rows.length,
      validRowCount: validRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      createCount: validRows.filter((row) => row.operation === "CREATE").length,
      updateCount: validRows.filter((row) => row.operation === "UPDATE").length,
      canConfirm: errors.length === 0 && rows.length > 0,
      columns: mappings.map((mapping) => mapping.header),
      columnMappings: mappings,
      errors,
      warnings,
      rows: rows.map((row) => this.publicRow(row)),
    };
  }

  async getBatch(batchId: string, schoolId: string) {
    const batch = await this.getBatchRecord(batchId, schoolId);
    const rows = await this.pool.query<{
      id: string;
      rowNumber: number;
      operation: MasterDataImportOperation | null;
      payload: Record<string, unknown> | null;
      errors: MasterDataImportIssue[];
      warnings: MasterDataImportIssue[];
    }>(
      `SELECT id::text, row_number AS "rowNumber", operation, payload, errors, warnings
         FROM master_data_import_rows
        WHERE batch_id = $1 AND tenant_id = $2
        ORDER BY row_number`,
      [batch.id, batch.tenant_id],
    );
    const definition = getMasterDataImportDefinition(batch.entity)!;
    const stagedRows = rows.rows.map((row) => this.stagedRowFromPayload(row));
    const errors = stagedRows.flatMap((row) => row.errors ?? []);
    const warnings = stagedRows.flatMap((row) => row.warnings ?? []);
    return this.previewFromBatch(
      batch,
      definition.columns.map((column) => ({
        column: "",
        header: column.header,
        field: column.key,
        required: column.required,
      })),
      stagedRows,
      errors,
      warnings,
    );
  }

  async confirm(batchId: string, schoolId: string, actorId: string, idempotencyKey: string | undefined) {
    const key = idempotencyKey?.trim();
    if (!key)
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key là bắt buộc khi xác nhận nhập dữ liệu.",
      });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const batchResult = await client.query<BatchRecord>(
        `SELECT id, tenant_id, school_id, entity, original_filename, contract_version, template_version,
                file_checksum, idempotency_key, status, row_count, valid_row_count, error_count,
                warning_count, create_count, update_count, created_by, created_at, confirmed_by,
                confirmed_at, confirmation_result
           FROM master_data_import_batches
          WHERE id = $1 AND school_id = $2
          FOR UPDATE`,
        [batchId, schoolId],
      );
      const batch = batchResult.rows[0];
      if (!batch) throw new NotFoundException("Lô nhập master data không tồn tại.");
      if (batch.idempotency_key && batch.idempotency_key !== key) {
        throw new BadRequestException({
          code: "IDEMPOTENCY_KEY_MISMATCH",
          message: "Lô nhập đã được gắn với một khóa idempotency khác.",
        });
      }
      if (!batch.idempotency_key) {
        await client.query(
          "UPDATE master_data_import_batches SET idempotency_key = $2, updated_at = now() WHERE id = $1",
          [batch.id, key],
        );
        batch.idempotency_key = key;
      }
      if (batch.status === "CONFIRMED") {
        await client.query("COMMIT");
        return batch.confirmation_result ?? this.confirmedResponse(batch, null);
      }
      if (batch.error_count > 0 || batch.row_count === 0) {
        throw new BadRequestException({
          code: "IMPORT_HAS_ERRORS",
          message: "Không thể xác nhận khi dữ liệu còn lỗi hoặc không có dòng dữ liệu.",
        });
      }
      const rowResult = await client.query<StagedRow & { payload: NormalizedPayload }>(
        `SELECT id::text, row_number AS "rowNumber", operation, payload, errors, warnings
           FROM master_data_import_rows
          WHERE batch_id = $1 AND tenant_id = $2
          ORDER BY row_number`,
        [batch.id, batch.tenant_id],
      );
      for (const row of rowResult.rows) {
        if (!row.payload)
          throw new BadRequestException({
            code: "IMPORT_ROW_PAYLOAD_MISSING",
            message: `Dòng ${row.rowNumber} không có dữ liệu chuẩn hóa.`,
          });
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `master-data:${schoolId}:${batch.entity}:${this.naturalKeyText(batch.entity, row.payload)}`,
        ]);
        await this.applyPayload(client, batch, row.payload, actorId);
      }
      const confirmedAt = new Date();
      await client.query(
        `UPDATE master_data_import_batches
            SET status = 'CONFIRMED', confirmed_by = $2, confirmed_at = $3, updated_at = now()
          WHERE id = $1`,
        [batch.id, actorId, confirmedAt],
      );
      const auditResult = await client.query<{
        id: string;
        actor_id: string;
        action: string;
        metadata: Record<string, unknown>;
        created_at: Date;
      }>(
        `INSERT INTO audit_logs (tenant_id, school_id, action, entity_type, entity_id, actor_id, metadata)
         SELECT school.tenant_id, $1, 'IMPORT', 'master_data_import', $2, $3, $4::jsonb
           FROM schools school
          WHERE school.id = $1
         RETURNING id, actor_id, action, metadata, created_at`,
        [
          schoolId,
          batch.id,
          actorId,
          JSON.stringify({
            entity: batch.entity,
            filename: batch.original_filename,
            fileChecksum: batch.file_checksum,
            contractVersion: batch.contract_version,
            templateVersion: batch.template_version,
            rowCount: batch.row_count,
            createCount: batch.create_count,
            updateCount: batch.update_count,
          }),
        ],
      );
      const auditLog = auditResult.rows[0] ? this.toAudit(auditResult.rows[0]) : null;
      const response = this.confirmedResponse({ ...batch, confirmed_by: actorId, confirmed_at: confirmedAt }, auditLog);
      await client.query("UPDATE master_data_import_batches SET confirmation_result = $2::jsonb WHERE id = $1", [
        batch.id,
        JSON.stringify(response),
      ]);
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async buildErrorReport(batchId: string, schoolId: string) {
    const batch = await this.getBatchRecord(batchId, schoolId);
    const rows = await this.pool.query<{ errors: MasterDataImportIssue[]; warnings: MasterDataImportIssue[] }>(
      `SELECT errors, warnings FROM master_data_import_rows WHERE batch_id = $1 AND tenant_id = $2 ORDER BY row_number`,
      [batch.id, batch.tenant_id],
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Thời khóa biểu trường học - Bộ tối ưu";
    const worksheet = workbook.addWorksheet("ImportErrors");
    worksheet.columns = [
      { header: "Trang tính", key: "sheet", width: 24 },
      { header: "Dòng", key: "row", width: 10 },
      { header: "Cột", key: "column", width: 16 },
      { header: "Ô", key: "cell", width: 16 },
      { header: "Trường dữ liệu", key: "field", width: 24 },
      { header: "Mã", key: "code", width: 30 },
      { header: "Mức độ", key: "severity", width: 12 },
      { header: "Thông báo", key: "message", width: 60 },
      { header: "Gợi ý xử lý", key: "remediationHint", width: 60 },
      { header: "Giá trị ban đầu", key: "value", width: 30 },
    ];
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    const issues = rows.rows.flatMap((row) => [...(row.errors ?? []), ...(row.warnings ?? [])]);
    for (const issue of issues)
      worksheet.addRow({
        ...issue,
        value: issue.value === null || issue.value === undefined ? "" : String(issue.value),
      });
    worksheet.autoFilter = `A1:J${Math.max(1, issues.length + 1)}`;
    return {
      filename: `master-data-${batch.entity}-error-report-${batch.id}.xlsx`,
      workbook: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
  }

  private async stageBatch(input: {
    id: string;
    schoolId: string;
    entity: MasterDataImportEntity;
    filename: string;
    checksum: string;
    importToken: string;
    actorId: string;
    rows: StagedRow[];
    rowCount: number;
    validRowCount: number;
    errorCount: number;
    warningCount: number;
    createCount: number;
    updateCount: number;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO master_data_import_batches
          (tenant_id, id, school_id, entity, original_filename, contract_version, template_version,
           file_checksum, idempotency_key, status, row_count, valid_row_count, error_count,
           warning_count, create_count, update_count, created_by)
         SELECT school.tenant_id, $1, $2, $3, $4, $5, $6, $7, $8, 'PREVIEWED', $9, $10, $11, $12, $13, $14, $15
           FROM schools school WHERE school.id = $2`,
        [
          input.id,
          input.schoolId,
          input.entity,
          input.filename,
          MASTER_DATA_IMPORT_CONTRACT_VERSION,
          MASTER_DATA_TEMPLATE_VERSION,
          input.checksum,
          input.importToken,
          input.rowCount,
          input.validRowCount,
          input.errorCount,
          input.warningCount,
          input.createCount,
          input.updateCount,
          input.actorId,
        ],
      );
      for (const row of input.rows) {
        const payload = row.normalized
          ? {
              ...row.normalized,
              __sourceValues: row.values,
            }
          : null;
        await client.query(
          `INSERT INTO master_data_import_rows (tenant_id, id, batch_id, row_number, operation, payload, errors, warnings)
           SELECT batch.tenant_id, $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb
             FROM master_data_import_batches batch WHERE batch.id = $2`,
          [
            row.id,
            input.id,
            row.rowNumber,
            row.operation,
            payload ? JSON.stringify(payload) : null,
            JSON.stringify(row.errors),
            JSON.stringify(row.warnings),
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
  }

  private validateRow(
    entity: MasterDataImportEntity,
    columns: MasterDataImportColumn[],
    values: Record<string, Scalar>,
    catalog: ImportCatalog,
    periods: Map<string, AcademicPeriodRecord>,
    relations: RelationCatalog,
    seenKeys: Set<string>,
    rowNumber: number,
  ): Omit<StagedRow, "id" | "rowNumber"> {
    const errors: MasterDataImportIssue[] = [];
    const warnings: MasterDataImportIssue[] = [];
    const definition = getMasterDataImportDefinition(entity)!;
    for (const column of columns) {
      if (column.required && !this.text(values[column.key]))
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            column.header,
            column.key,
            "REQUIRED",
            `${column.header} là bắt buộc.`,
            values[column.key],
            "Bổ sung giá trị theo header trong template.",
          ),
        );
      if (this.text(values[column.key]) && column.type === "integer" && this.integer(values[column.key]) === null)
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            column.header,
            column.key,
            "INVALID_NUMBER",
            `${column.header} phải là số nguyên.`,
            values[column.key],
            "Nhập số nguyên, không nhập chữ hoặc công thức.",
          ),
        );
    }
    if (entity === "class" || entity === "teacher" || entity === "subject" || entity === "room") {
      const code = this.text(values.code);
      if (
        entity === "class" &&
        this.integer(values.grade) !== null &&
        (this.integer(values.grade)! < 6 || this.integer(values.grade)! > 12)
      )
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            "Khối",
            "grade",
            "GRADE_OUT_OF_RANGE",
            "Khối phải là số nguyên từ 6 đến 12.",
            values.grade,
            "Nhập khối từ 6 đến 12.",
          ),
        );
      if (
        entity === "room" &&
        this.text(values.capacity) &&
        (this.integer(values.capacity) === null || this.integer(values.capacity)! < 1)
      )
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            "Sức chứa",
            "capacity",
            "CAPACITY_INVALID",
            "Sức chứa phải là số nguyên dương.",
            values.capacity,
            "Nhập sức chứa lớn hơn 0 hoặc để trống.",
          ),
        );
      const normalizedKey = this.normalize(code);
      if (normalizedKey && seenKeys.has(normalizedKey))
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            "Mã",
            "code",
            "DUPLICATE",
            `Mã ${code} bị lặp trong file.`,
            values.code,
            "Chỉ giữ một dòng cho mỗi mã.",
          ),
        );
      if (normalizedKey) seenKeys.add(normalizedKey);
      const existing = normalizedKey ? catalog.records.get(normalizedKey) : undefined;
      if (existing?.status === "ARCHIVED")
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            "Mã",
            "code",
            "ARCHIVED_RECORD",
            `Mã ${code} đang ở trạng thái lưu trữ.`,
            values.code,
            "Không tự động khôi phục; dùng CRUD hoặc quy trình khôi phục được phê duyệt.",
          ),
        );
      const name = entity === "teacher" ? this.text(values.displayName) : this.text(values.name);
      const duplicateName =
        name && entity !== "teacher"
          ? [...catalog.records.values()].find(
              (record) =>
                record.id !== existing?.id &&
                this.normalize(entity === "room" ? (record.name ?? "") : (record.name ?? "")) === this.normalize(name),
            )
          : undefined;
      if (duplicateName)
        errors.push(
          this.issue(
            definition.sheetName,
            rowNumber,
            "Tên",
            entity === "class" ? "name" : "name",
            "NAME_CONFLICT",
            `${definition.label} có tên ${name} đã tồn tại với mã khác.`,
            name,
            "Đổi tên hoặc dùng đúng mã đang tồn tại.",
          ),
        );
      const operation: MasterDataImportOperation | null =
        errors.length === 0 && code ? (existing ? "UPDATE" : "CREATE") : null;
      const normalized =
        errors.length === 0 && operation ? this.normalizeMasterValues(entity, values, existing?.id) : null;
      return { status: errors.length ? "INVALID" : "VALID", operation, values, normalized, errors, warnings };
    }

    const teacher = this.resolveRelation(
      values.teacherCode,
      catalog.teachers,
      definition.sheetName,
      rowNumber,
      "teacherCode",
      "Mã giáo viên",
      errors,
    );
    const subject =
      entity === "teacherSubjectGrade"
        ? this.resolveRelation(
            values.subjectCode,
            catalog.subjects,
            definition.sheetName,
            rowNumber,
            "subjectCode",
            "Mã môn",
            errors,
          )
        : undefined;
    const classRecord =
      entity === "homeroom"
        ? this.resolveRelation(
            values.classCode,
            catalog.classes,
            definition.sheetName,
            rowNumber,
            "classCode",
            "Mã lớp",
            errors,
          )
        : undefined;
    const periodKey = `${this.text(values.academicYear)}|${this.text(values.termCode)}`;
    const period = periods.get(this.normalize(periodKey));
    if (!period)
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Năm học/Mã học kỳ",
          "academicPeriodId",
          "ACADEMIC_PERIOD_NOT_FOUND",
          `Không tìm thấy khung năm học/kỳ học ${periodKey}.`,
          periodKey,
          "Kiểm tra Năm học và Mã học kỳ theo danh mục.",
        ),
      );
    if (this.integer(values.grade) !== null && (this.integer(values.grade)! < 6 || this.integer(values.grade)! > 12))
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Khối",
          "grade",
          "GRADE_OUT_OF_RANGE",
          "Khối phải là số nguyên từ 6 đến 12.",
          values.grade,
          "Nhập khối từ 6 đến 12.",
        ),
      );
    if (
      entity === "homeroom" &&
      this.text(values.weeklyReductionPeriods) &&
      (this.integer(values.weeklyReductionPeriods) === null ||
        this.integer(values.weeklyReductionPeriods)! < 0 ||
        this.integer(values.weeklyReductionPeriods)! > 10)
    )
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Số tiết giảm",
          "weeklyReductionPeriods",
          "REDUCTION_OUT_OF_RANGE",
          "Số tiết giảm phải từ 0 đến 10.",
          values.weeklyReductionPeriods,
          "Nhập số tiết giảm theo rule đã được phê duyệt.",
        ),
      );
    const key =
      entity === "teacherSubjectGrade"
        ? [teacher?.id, subject?.id, this.integer(values.grade), period?.id].join("|")
        : [classRecord?.id, period?.id].join("|");
    if (seenKeys.has(key))
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Khóa tự nhiên",
          "naturalKey",
          "DUPLICATE",
          "Khóa tự nhiên bị lặp trong file.",
          key,
          "Chỉ giữ một dòng cho mỗi khóa tự nhiên.",
        ),
      );
    if (key !== "|||" && key !== "|") seenKeys.add(key);
    if (period?.status === "ARCHIVED")
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Năm học/Mã học kỳ",
          "academicPeriodId",
          "ARCHIVED_REFERENCE",
          `Khung năm học/kỳ học ${periodKey} đang ở trạng thái lưu trữ.`,
          periodKey,
          "Chọn khung năm học/kỳ học đang hoạt động.",
        ),
      );
    const relationKey =
      entity === "teacherSubjectGrade"
        ? [teacher?.id, subject?.id, this.integer(values.grade), period?.id].join("|")
        : [classRecord?.id, period?.id].join("|");
    const existingRelation =
      entity === "teacherSubjectGrade"
        ? relations.teacherSubjectGrade.get(relationKey)
        : relations.homeroom.get(relationKey);
    if (existingRelation?.status === "ARCHIVED")
      errors.push(
        this.issue(
          definition.sheetName,
          rowNumber,
          "Khóa tự nhiên",
          "naturalKey",
          "ARCHIVED_RELATION",
          "Quan hệ phân công đang ở trạng thái lưu trữ và không được tự động khôi phục.",
          relationKey,
          "Dùng quy trình khôi phục được phê duyệt hoặc tạo khóa mới.",
        ),
      );
    const normalized =
      errors.length === 0 &&
      period &&
      teacher &&
      (entity === "teacherSubjectGrade" ? Boolean(subject) : Boolean(classRecord))
        ? this.normalizeRelationValues(entity, values, teacher, subject, classRecord, period)
        : null;
    return {
      status: errors.length ? "INVALID" : "VALID",
      operation: normalized ? (existingRelation ? "UPDATE" : "CREATE") : null,
      values,
      normalized,
      errors,
      warnings,
    };
  }

  private async loadCatalog(schoolId: string, entity: MasterDataImportEntity): Promise<ImportCatalog> {
    const emptyCatalog = (): ImportCatalog => ({
      records: new Map(),
      teachers: new Map(),
      classes: new Map(),
      subjects: new Map(),
      rooms: new Map(),
    });
    const catalog = emptyCatalog();
    if (entity === "teacherSubjectGrade" || entity === "homeroom") {
      const [teachers, classes, subjects] = await Promise.all([
        this.pool.query<CatalogRecord>("SELECT id::text, code, status FROM teachers WHERE school_id = $1", [schoolId]),
        this.pool.query<CatalogRecord>("SELECT id::text, code, status, grade FROM classes WHERE school_id = $1", [
          schoolId,
        ]),
        this.pool.query<CatalogRecord>("SELECT id::text, code, status FROM subjects WHERE school_id = $1", [schoolId]),
      ]);
      for (const row of teachers.rows) catalog.teachers.set(this.normalize(row.code), row);
      for (const row of classes.rows) catalog.classes.set(this.normalize(row.code), row);
      for (const row of subjects.rows) catalog.subjects.set(this.normalize(row.code), row);
      return catalog;
    }
    const table = MASTER_ENTITY_TABLES[entity];
    const columns =
      entity === "teacher"
        ? "id::text, code, status, display_name"
        : entity === "class"
          ? "id::text, code, status, name, grade"
          : entity === "room"
            ? "id::text, code, status, name, room_type, capacity"
            : "id::text, code, status, name";
    const rows = await this.pool.query<CatalogRecord>(`SELECT ${columns} FROM ${table} WHERE school_id = $1`, [
      schoolId,
    ]);
    for (const row of rows.rows) catalog.records.set(this.normalize(row.code), row);
    return catalog;
  }

  private async loadPeriods(schoolId: string) {
    const periods = new Map<string, AcademicPeriodRecord>();
    const result = await this.pool.query<AcademicPeriodRecord>(
      "SELECT id::text, academic_year, term_code, status FROM academic_periods WHERE school_id = $1",
      [schoolId],
    );
    for (const row of result.rows) periods.set(this.normalize(`${row.academic_year}|${row.term_code}`), row);
    return periods;
  }

  private emptyRelationCatalog(): RelationCatalog {
    return { teacherSubjectGrade: new Map(), homeroom: new Map() };
  }

  private async loadRelationCatalog(schoolId: string) {
    const catalog = this.emptyRelationCatalog();
    const [eligibility, homeroom] = await Promise.all([
      this.pool.query<{
        id: string;
        teacher_id: string;
        subject_id: string;
        academic_period_id: string;
        grade: number;
        status: "ACTIVE" | "ARCHIVED";
      }>(
        `SELECT id::text, teacher_id::text, subject_id::text, academic_period_id::text, grade, status
           FROM teacher_subject_grade_assignments
          WHERE school_id = $1`,
        [schoolId],
      ),
      this.pool.query<{ id: string; class_id: string; academic_period_id: string }>(
        `SELECT id::text, class_id::text, academic_period_id::text
           FROM class_homeroom_assignments
          WHERE school_id = $1`,
        [schoolId],
      ),
    ]);
    for (const row of eligibility.rows)
      catalog.teacherSubjectGrade.set([row.teacher_id, row.subject_id, row.grade, row.academic_period_id].join("|"), {
        id: row.id,
        status: row.status,
      });
    for (const row of homeroom.rows)
      catalog.homeroom.set([row.class_id, row.academic_period_id].join("|"), { id: row.id, status: "ACTIVE" });
    return catalog;
  }

  private async applyPayload(client: PoolClient, batch: BatchRecord, payload: NormalizedPayload, actorId: string) {
    if (batch.entity === "teacherSubjectGrade") {
      const existing = await client.query<{ status: "ACTIVE" | "ARCHIVED" }>(
        `SELECT status
           FROM teacher_subject_grade_assignments
          WHERE tenant_id = $1 AND school_id = $2 AND academic_period_id = $3
            AND teacher_id = $4 AND subject_id = $5 AND grade = $6
          FOR UPDATE`,
        [
          batch.tenant_id,
          batch.school_id,
          payload.academicPeriodId,
          payload.teacherId,
          payload.subjectId,
          payload.grade,
        ],
      );
      if (existing.rows[0]?.status === "ARCHIVED")
        throw new ConflictException({
          code: "ARCHIVED_RELATION",
          message: "Không thể tự động khôi phục phân công chuyên môn đã lưu trữ.",
        });
      await client.query(
        `INSERT INTO teacher_subject_grade_assignments
          (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade, status, source_ref)
         SELECT school.tenant_id, $1, $2, $3, $4, $5, 'ACTIVE', $6
           FROM schools school WHERE school.id = $1
         ON CONFLICT (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
         DO UPDATE SET source_ref = EXCLUDED.source_ref, updated_at = now()`,
        [
          batch.school_id,
          payload.academicPeriodId,
          payload.teacherId,
          payload.subjectId,
          payload.grade,
          `master-data-import:${batch.id}:${actorId}`,
        ],
      );
      return;
    }
    if (batch.entity === "homeroom") {
      await client.query(
        `INSERT INTO class_homeroom_assignments
          (tenant_id, school_id, academic_period_id, class_id, teacher_id, weekly_reduction_periods, rule_code)
         SELECT school.tenant_id, $1, $2, $3, $4, $5, $6
           FROM schools school WHERE school.id = $1
         ON CONFLICT (tenant_id, school_id, academic_period_id, class_id)
         DO UPDATE SET teacher_id = EXCLUDED.teacher_id, weekly_reduction_periods = EXCLUDED.weekly_reduction_periods, rule_code = EXCLUDED.rule_code, updated_at = now()`,
        [
          batch.school_id,
          payload.academicPeriodId,
          payload.classId,
          payload.teacherId,
          payload.weeklyReductionPeriods ?? 4,
          payload.ruleCode ?? "TT_05_2025_D9_1",
        ],
      );
      return;
    }
    const existingId = payload.existingId;
    if (existingId) {
      const table = MASTER_ENTITY_TABLES[batch.entity];
      const assignments = this.updateAssignments(batch.entity, payload);
      const updateResult = await client.query(
        `UPDATE ${table} SET ${assignments.setClause}, updated_at = now() WHERE id = $${assignments.values.length + 1} AND school_id = $${assignments.values.length + 2} AND status = 'ACTIVE'`,
        [...assignments.values, existingId, batch.school_id],
      );
      if (updateResult.rowCount === 0)
        throw new ConflictException({
          code: "MASTER_RECORD_CHANGED",
          message: "Bản ghi danh mục đã thay đổi hoặc được lưu trữ sau khi xem trước.",
        });
      return;
    }
    const table = MASTER_ENTITY_TABLES[batch.entity];
    const insert = this.insertAssignments(batch.entity, payload);
    await client.query(
      `INSERT INTO ${table} (tenant_id, school_id, ${insert.columns.join(", ")}, status)
       SELECT school.tenant_id, $1, ${insert.columns.map((_, index) => `$${index + 2}`).join(", ")}, 'ACTIVE'
         FROM schools school WHERE school.id = $1`,
      [batch.school_id, ...insert.values],
    );
  }

  private updateAssignments(entity: "class" | "teacher" | "subject" | "room", payload: NormalizedPayload) {
    const fields =
      entity === "class"
        ? ["name", "grade"]
        : entity === "teacher"
          ? ["display_name"]
          : entity === "subject"
            ? ["name"]
            : ["name", "room_type", "capacity"];
    const values: Scalar[] = [];
    const setClause = fields
      .map((field) => {
        const value = payload[field] ?? null;
        values.push(value);
        return `${field} = $${values.length}`;
      })
      .join(", ");
    return { setClause, values };
  }

  private insertAssignments(entity: "class" | "teacher" | "subject" | "room", payload: NormalizedPayload) {
    const columns =
      entity === "class"
        ? ["code", "name", "grade"]
        : entity === "teacher"
          ? ["code", "display_name"]
          : entity === "subject"
            ? ["code", "name"]
            : ["code", "name", "room_type", "capacity"];
    return { columns, values: columns.map((column) => payload[column] ?? null) };
  }

  private normalizeMasterValues(
    entity: "class" | "teacher" | "subject" | "room",
    values: Record<string, Scalar>,
    existingId?: string,
  ): NormalizedPayload {
    const base: NormalizedPayload = { code: this.text(values.code) };
    if (entity === "class") Object.assign(base, { name: this.text(values.name), grade: this.integer(values.grade) });
    if (entity === "teacher") base.displayName = this.text(values.displayName);
    if (entity === "subject") base.name = this.text(values.name);
    if (entity === "room")
      Object.assign(base, {
        name: this.text(values.name),
        roomType: this.text(values.roomType) || null,
        capacity: this.integer(values.capacity),
      });
    if (existingId) base.existingId = existingId;
    return base;
  }

  private normalizeRelationValues(
    entity: "teacherSubjectGrade" | "homeroom",
    values: Record<string, Scalar>,
    teacher: CatalogRecord,
    subject: CatalogRecord | undefined,
    classRecord: CatalogRecord | undefined,
    period: AcademicPeriodRecord,
  ): NormalizedPayload {
    if (entity === "teacherSubjectGrade")
      return {
        teacherId: teacher.id,
        subjectId: subject!.id,
        grade: this.integer(values.grade),
        academicPeriodId: period.id,
      };
    return {
      classId: classRecord!.id,
      teacherId: teacher.id,
      academicPeriodId: period.id,
      weeklyReductionPeriods: this.integer(values.weeklyReductionPeriods) ?? 4,
      ruleCode: this.text(values.ruleCode) || "TT_05_2025_D9_1",
    };
  }

  private resolveRelation(
    value: Scalar,
    catalog: Map<string, CatalogRecord>,
    sheet: string,
    row: number,
    field: string,
    label: string,
    errors: MasterDataImportIssue[],
  ) {
    const text = this.text(value);
    const record = catalog.get(this.normalize(text));
    if (text && (!record || record.status !== "ACTIVE"))
      errors.push(
        this.issue(
          sheet,
          row,
          label,
          field,
          record?.status === "ARCHIVED" ? "ARCHIVED_REFERENCE" : "UNKNOWN_REFERENCE",
          `${label} ${text} không tồn tại hoặc không ở trạng thái hoạt động.`,
          value,
          `Chọn ${label.toLowerCase()} đang hoạt động trong danh mục.`,
        ),
      );
    return record?.status === "ACTIVE" ? record : undefined;
  }

  private headerMappings(worksheet: ExcelJS.Worksheet, columns: MasterDataImportColumn[]) {
    const headers = new Map<string, { index: number; header: string; column: string }>();
    const headerRow = worksheet.getRow(1);
    for (let index = 1; index <= headerRow.cellCount; index += 1) {
      const header = this.text(this.scalar(headerRow.getCell(index).value));
      if (header) headers.set(this.normalize(header), { index, header, column: this.columnLetter(index) });
    }
    const mappings = columns.map((column) => {
      const candidates = [column.header, ...(HEADER_ALIASES[column.key] ?? [])];
      const found = candidates.map((candidate) => headers.get(this.normalize(candidate))).find(Boolean);
      return {
        column: found?.column ?? this.columnLetter(columns.indexOf(column) + 1),
        header: found?.header ?? column.header,
        field: found ? column.key : null,
        required: column.required,
        index: found?.index,
      };
    });
    return {
      indexedMappings: mappings.filter((mapping) => mapping.index !== undefined),
      mappings: mappings
        .filter((mapping) => mapping.index !== undefined)
        .map((mapping) => ({
          column: mapping.column,
          header: mapping.header,
          field: mapping.field,
          required: mapping.required,
        })),
      missingColumns: columns
        .filter((column) => column.required && !mappings.find((mapping) => mapping.field === column.key))
        .map((column) => column.header),
    };
  }

  private readValues(row: ExcelJS.Row, mappings: Array<{ field: string | null; index?: number }>) {
    const values: Record<string, Scalar> = {};
    for (const mapping of mappings)
      if (mapping.field && mapping.index) values[mapping.field] = this.scalar(row.getCell(mapping.index).value);
    return values;
  }

  private rowHasValues(row: ExcelJS.Row, mappings: Array<{ field: string | null; index?: number }>) {
    return mappings.some((mapping) => mapping.index && this.text(this.scalar(row.getCell(mapping.index).value)));
  }

  private stagedRowFromPayload(row: {
    id: string;
    rowNumber: number;
    operation: MasterDataImportOperation | null;
    payload: Record<string, unknown> | null;
    errors: MasterDataImportIssue[];
    warnings: MasterDataImportIssue[];
  }): StagedRow {
    const payload = row.payload ?? {};
    const sourceValues =
      payload.__sourceValues && typeof payload.__sourceValues === "object"
        ? (payload.__sourceValues as Record<string, Scalar>)
        : {};
    const normalized = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "__sourceValues" && key !== "existingId"),
    ) as Record<string, Scalar>;
    const errors = Array.isArray(row.errors) ? row.errors : [];
    const warnings = Array.isArray(row.warnings) ? row.warnings : [];
    return {
      id: row.id,
      rowNumber: row.rowNumber,
      operation: row.operation,
      values: sourceValues,
      normalized: Object.keys(normalized).length > 0 ? normalized : null,
      errors,
      warnings,
      status: errors.length > 0 ? "INVALID" : warnings.length > 0 ? "WARNING" : "VALID",
    };
  }

  private publicRow(row: StagedRow): MasterDataImportRowPreview {
    return {
      rowNumber: row.rowNumber,
      status: row.status,
      operation: row.operation,
      values: row.values,
      normalized: row.normalized,
      errors: row.errors,
      warnings: row.warnings,
    };
  }

  private previewFromBatch(
    batch: BatchRecord,
    mappings: MasterDataImportPreview["columnMappings"],
    rows: StagedRow[],
    errors: MasterDataImportIssue[],
    warnings: MasterDataImportIssue[],
  ): MasterDataImportPreview {
    const definition = getMasterDataImportDefinition(batch.entity)!;
    return {
      contractVersion: batch.contract_version as typeof MASTER_DATA_IMPORT_CONTRACT_VERSION,
      templateVersion: batch.template_version as typeof MASTER_DATA_TEMPLATE_VERSION,
      entity: batch.entity,
      label: definition.label,
      sheetName: definition.sheetName,
      filename: batch.original_filename,
      fileChecksum: batch.file_checksum,
      importBatchId: batch.id,
      importToken: batch.idempotency_key ?? "",
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      errorCount: batch.error_count,
      warningCount: batch.warning_count,
      createCount: batch.create_count,
      updateCount: batch.update_count,
      canConfirm: batch.status === "PREVIEWED" && batch.error_count === 0 && batch.row_count > 0,
      columns: mappings.map((mapping) => mapping.header),
      columnMappings: mappings,
      errors,
      warnings,
      rows: rows.map((row) => this.publicRow(row)),
    };
  }

  private async getBatchRecord(batchId: string, schoolId: string) {
    const result = await this.pool.query<BatchRecord>(
      "SELECT * FROM master_data_import_batches WHERE id = $1 AND school_id = $2",
      [batchId, schoolId],
    );
    const batch = result.rows[0];
    if (!batch) throw new NotFoundException("Lô nhập master data không tồn tại.");
    return batch;
  }

  private async ensureSchool(schoolId: string) {
    const result = await this.pool.query("SELECT id FROM schools WHERE id = $1 AND status = 'ACTIVE'", [schoolId]);
    if (result.rowCount === 0) throw new NotFoundException("Trường không tồn tại hoặc không hoạt động.");
  }

  private entityFromValue(value: string | undefined): MasterDataImportEntity {
    if (value && MASTER_DATA_IMPORT_DEFINITIONS.some((definition) => definition.entity === value))
      return value as MasterDataImportEntity;
    throw new BadRequestException({
      code: "ENTITY_INVALID",
      message: "Loại dữ liệu Excel không được hỗ trợ.",
      supportedEntities: MASTER_DATA_IMPORT_DEFINITIONS.map((definition) => definition.entity),
    });
  }

  private addTemplateValidations(worksheet: ExcelJS.Worksheet, columns: MasterDataImportColumn[]) {
    columns.forEach((column, index) => {
      for (let row = 2; row <= 200; row += 1) {
        if (column.key === "grade")
          worksheet.getCell(`${this.columnLetter(index + 1)}${row}`).dataValidation = {
            type: "whole",
            operator: "between",
            formulae: [6, 12],
            allowBlank: false,
          };
        if (column.key === "capacity")
          worksheet.getCell(`${this.columnLetter(index + 1)}${row}`).dataValidation = {
            type: "whole",
            operator: "greaterThanOrEqual",
            formulae: [1],
            allowBlank: true,
          };
      }
    });
  }

  private columnWidth(column: MasterDataImportColumn) {
    if (column.key === "description") return 50;
    return Math.max(16, Math.min(34, column.header.length + 8));
  }

  private naturalKeyText(entity: MasterDataImportEntity, payload: NormalizedPayload) {
    if (entity === "teacherSubjectGrade")
      return [payload.teacherId, payload.subjectId, payload.grade, payload.academicPeriodId].join("|");
    if (entity === "homeroom") return [payload.classId, payload.academicPeriodId].join("|");
    return String(payload.code ?? "");
  }

  private issue(
    sheet: string,
    row: number,
    field: string,
    fieldKey: string,
    code: string,
    message: string,
    value: Scalar,
    remediationHint: string,
  ): MasterDataImportIssue {
    return {
      sheet,
      row,
      column: field,
      cell: `${field}${row}`,
      field: fieldKey,
      code,
      severity: "ERROR",
      message,
      remediationHint,
      value,
    };
  }

  private scalar(value: unknown): Scalar {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object" && value !== null && "richText" in value)
      return String((value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? "").join(""));
    return String(value);
  }

  private text(value: Scalar) {
    return value === null ? "" : String(value).trim();
  }

  private integer(value: Scalar) {
    if (value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isInteger(parsed) ? parsed : null;
  }

  private normalize(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();
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

  private confirmedResponse(
    batch: Pick<
      BatchRecord,
      | "id"
      | "entity"
      | "original_filename"
      | "template_version"
      | "file_checksum"
      | "idempotency_key"
      | "row_count"
      | "valid_row_count"
      | "create_count"
      | "update_count"
      | "confirmed_by"
      | "confirmed_at"
    >,
    auditLog: ReturnType<MasterDataImportService["toAudit"]> | null,
  ) {
    return {
      contractVersion: MASTER_DATA_IMPORT_CONTRACT_VERSION,
      importBatchId: batch.id,
      entity: batch.entity,
      status: "CONFIRMED",
      filename: batch.original_filename,
      templateVersion: batch.template_version,
      fileChecksum: batch.file_checksum,
      importToken: batch.idempotency_key,
      rowCount: batch.row_count,
      validRowCount: batch.valid_row_count,
      createCount: batch.create_count,
      updateCount: batch.update_count,
      confirmedBy: batch.confirmed_by,
      confirmedAt: batch.confirmed_at?.toISOString() ?? null,
      message: "Nhập dữ liệu master data thành công.",
      auditLog,
    };
  }

  private toAudit(row: {
    id: string;
    actor_id: string;
    action: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }) {
    return {
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      message: `Người dùng ${row.actor_id} đã nhập master data lúc ${row.created_at.toISOString()}`,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    };
  }
}
