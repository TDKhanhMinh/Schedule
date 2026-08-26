export interface ImportIssue {
  sheet: string;
  row: number;
  column: string;
  cell: string;
  field: string;
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
}

export interface PreviewResponse {
  importBatchId: string;
  importToken: string;
  filename: string;
  templateVersion: string;
  rowCount: number;
  validRowCount: number;
  errorCount: number;
  warningCount: number;
  canConfirm: boolean;
  columns: string[];
  columnMappings: Array<{ column: string; header: string; field: string | null; required: boolean }>;
  sheetSummaries: Array<{ sheet: string; index: number; status: string; rowCount: number; columnCount: number }>;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  rows: Array<{
    rowNumber: number;
    status: "VALID" | "WARNING" | "INVALID";
    values: Record<string, string | number | null>;
    normalized: unknown;
  }>;
}

export interface ConfirmResponse {
  message: string;
  validRowCount: number;
  auditLog?: { message: string } | null;
}
