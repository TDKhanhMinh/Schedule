import type { MasterDataImportEntity, MasterDataImportPreview } from "@schedule/backend/contracts";
import { authHeaders, frontendConfig } from "../../config";

export interface MasterDataImportConfirmResponse {
  contractVersion: string;
  importBatchId: string;
  entity: MasterDataImportEntity;
  status: "CONFIRMED";
  filename: string;
  templateVersion: string;
  fileChecksum: string;
  importToken: string;
  rowCount: number;
  validRowCount: number;
  createCount: number;
  updateCount: number;
  confirmedBy: string;
  confirmedAt: string;
  message: string;
  auditLog?: { id: string; action: string; message: string; createdAt: string } | null;
}

export class MasterDataImportApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "MasterDataImportApiError";
  }
}

function importBasePath() {
  return `${frontendConfig.apiBaseUrl}/schools/${encodeURIComponent(frontendConfig.schoolId)}/master-data-imports`;
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    return Array.isArray(message)
      ? message.join(", ")
      : typeof message === "string"
        ? message
        : "Không thể nhập Excel.";
  }
  return "Không thể nhập Excel.";
}

export async function downloadMasterDataTemplate(entity: MasterDataImportEntity) {
  const response = await fetch(`${importBasePath()}/templates/${encodeURIComponent(entity)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new MasterDataImportApiError(await readError(response), response.status, null);
  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const filename =
    contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `master-data-${entity}-template-v1.0.xlsx`;
  return { blob, filename };
}

export async function previewMasterDataImport(entity: MasterDataImportEntity, file: File) {
  const body = new FormData();
  body.append("entity", entity);
  body.append("file", file);
  const response = await fetch(`${importBasePath()}/preview`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  if (!response.ok)
    throw new MasterDataImportApiError(
      await readError(response),
      response.status,
      await response.json().catch(() => null),
    );
  return (await response.json()) as MasterDataImportPreview;
}

export async function confirmMasterDataImport(preview: MasterDataImportPreview) {
  const response = await fetch(`${importBasePath()}/${encodeURIComponent(preview.importBatchId)}/confirm`, {
    method: "POST",
    headers: { ...authHeaders(), "Idempotency-Key": preview.importToken },
  });
  if (!response.ok)
    throw new MasterDataImportApiError(
      await readError(response),
      response.status,
      await response.json().catch(() => null),
    );
  return (await response.json()) as MasterDataImportConfirmResponse;
}

export async function downloadMasterDataErrorReport(preview: MasterDataImportPreview) {
  const response = await fetch(`${importBasePath()}/${encodeURIComponent(preview.importBatchId)}/error-report`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new MasterDataImportApiError(await readError(response), response.status, null);
  const blob = await response.blob();
  return { blob, filename: `master-data-${preview.entity}-error-report-${preview.importBatchId}.xlsx` };
}

export function saveDownloadedFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
