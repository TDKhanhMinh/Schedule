export const MASTER_DATA_IMPORT_CONTRACT_VERSION = "MASTER-DATA-IMPORT-1.0.0" as const;
export const MASTER_DATA_TEMPLATE_VERSION = "1.1" as const;

export type MasterDataImportEntity = "class" | "teacher" | "subject" | "room" | "teacherSubjectGrade" | "homeroom";

export type MasterDataImportOperation = "CREATE" | "UPDATE";

export interface MasterDataImportColumn {
  key: string;
  header: string;
  required: boolean;
  type: "string" | "integer";
  description: string;
}

export interface MasterDataImportDefinition {
  entity: MasterDataImportEntity;
  label: string;
  sheetName: string;
  naturalKey: string[];
  columns: MasterDataImportColumn[];
}

const academicPeriodColumns: MasterDataImportColumn[] = [
  {
    key: "academicYear",
    header: "Năm học",
    required: true,
    type: "string",
    description: "Dạng YYYY-YYYY, ví dụ 2026-2027.",
  },
  {
    key: "termCode",
    header: "Mã học kỳ",
    required: true,
    type: "string",
    description: "Mã học kỳ trong khung năm học, ví dụ TERM_1.",
  },
];

export const MASTER_DATA_IMPORT_DEFINITIONS: readonly MasterDataImportDefinition[] = [
  {
    entity: "class",
    label: "Lớp",
    sheetName: "Classes",
    naturalKey: ["code"],
    columns: [
      { key: "code", header: "Mã lớp", required: true, type: "string", description: "Mã lớp duy nhất trong trường." },
      { key: "name", header: "Tên lớp", required: true, type: "string", description: "Tên hiển thị của lớp." },
      { key: "grade", header: "Khối", required: true, type: "integer", description: "Số nguyên từ 6 đến 12." },
    ],
  },
  {
    entity: "teacher",
    label: "Giáo viên",
    sheetName: "Teachers",
    naturalKey: ["code"],
    columns: [
      {
        key: "code",
        header: "Mã giáo viên",
        required: true,
        type: "string",
        description: "Mã giáo viên duy nhất trong trường.",
      },
      {
        key: "displayName",
        header: "Tên giáo viên",
        required: true,
        type: "string",
        description: "Tên hiển thị của giáo viên.",
      },
    ],
  },
  {
    entity: "subject",
    label: "Môn học",
    sheetName: "Subjects",
    naturalKey: ["Tên môn (Mã môn tự sinh)"],
    columns: [
      {
        key: "name",
        header: "Tên môn",
        required: true,
        type: "string",
        description: "Tên hiển thị; mã môn được tự sinh từ chữ cái đầu của từng từ.",
      },
    ],
  },
  {
    entity: "room",
    label: "Phòng học",
    sheetName: "Rooms",
    naturalKey: ["code"],
    columns: [
      {
        key: "code",
        header: "Mã phòng",
        required: true,
        type: "string",
        description: "Mã phòng duy nhất trong trường.",
      },
      { key: "name", header: "Tên phòng", required: true, type: "string", description: "Tên hiển thị của phòng học." },
      {
        key: "roomType",
        header: "Loại phòng",
        required: false,
        type: "string",
        description: "Loại phòng hoặc capability nghiệp vụ.",
      },
      {
        key: "capacity",
        header: "Sức chứa",
        required: false,
        type: "integer",
        description: "Số nguyên dương nếu có khai báo.",
      },
    ],
  },
  {
    entity: "teacherSubjectGrade",
    label: "Phân công chuyên môn",
    sheetName: "TeacherSubjectGrades",
    naturalKey: ["teacherCode", "subjectCode", "grade", "academicYear", "termCode"],
    columns: [
      {
        key: "teacherCode",
        header: "Mã giáo viên",
        required: true,
        type: "string",
        description: "Mã giáo viên đã có trong danh mục.",
      },
      {
        key: "subjectCode",
        header: "Mã môn",
        required: true,
        type: "string",
        description: "Mã môn đã có trong danh mục.",
      },
      { key: "grade", header: "Khối", required: true, type: "integer", description: "Số nguyên từ 6 đến 12." },
      ...academicPeriodColumns,
    ],
  },
  {
    entity: "homeroom",
    label: "Phân công chủ nhiệm",
    sheetName: "HomeroomAssignments",
    naturalKey: ["classCode", "academicYear", "termCode"],
    columns: [
      {
        key: "classCode",
        header: "Mã lớp",
        required: true,
        type: "string",
        description: "Lớp cụ thể được phân công chủ nhiệm.",
      },
      {
        key: "teacherCode",
        header: "Mã giáo viên",
        required: true,
        type: "string",
        description: "Mã giáo viên đã có trong danh mục.",
      },
      ...academicPeriodColumns,
      {
        key: "weeklyReductionPeriods",
        header: "Số tiết giảm",
        required: false,
        type: "integer",
        description: "Số tiết giảm theo rule đã được phê duyệt.",
      },
      {
        key: "ruleCode",
        header: "Mã quy định",
        required: false,
        type: "string",
        description: "Mã rule và nguồn tham chiếu.",
      },
    ],
  },
];

export interface MasterDataImportRowPreview {
  rowNumber: number;
  status: "VALID" | "INVALID" | "WARNING";
  operation: MasterDataImportOperation | null;
  values: Record<string, string | number | null>;
  normalized: Record<string, string | number | null> | null;
  errors: MasterDataImportIssue[];
  warnings: MasterDataImportIssue[];
}

export interface MasterDataImportIssue {
  sheet: string;
  row: number;
  column: string;
  cell: string;
  field: string;
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  remediationHint: string;
  value: string | number | null;
}

export interface MasterDataImportPreview {
  contractVersion: typeof MASTER_DATA_IMPORT_CONTRACT_VERSION;
  templateVersion: typeof MASTER_DATA_TEMPLATE_VERSION;
  entity: MasterDataImportEntity;
  label: string;
  sheetName: string;
  filename: string;
  fileChecksum: string;
  importBatchId: string;
  importToken: string;
  rowCount: number;
  validRowCount: number;
  errorCount: number;
  warningCount: number;
  createCount: number;
  updateCount: number;
  canConfirm: boolean;
  columns: string[];
  columnMappings: Array<{
    column: string;
    header: string;
    field: string | null;
    required: boolean;
  }>;
  errors: MasterDataImportIssue[];
  warnings: MasterDataImportIssue[];
  rows: MasterDataImportRowPreview[];
}

export function getMasterDataImportDefinition(entity: MasterDataImportEntity) {
  return MASTER_DATA_IMPORT_DEFINITIONS.find((definition) => definition.entity === entity);
}
