import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../../app/app-shell";
import { frontendConfig } from "../../config";
import { apiBlob, apiRequest } from "../../lib/api-client";
import { navigateTo } from "../../routing";
import { PreviewPanel } from "./preview-panel";
import type { ConfirmResponse, PreviewResponse } from "./import-types";

export function ImportScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const previewMutation = useMutation({
    mutationFn: async (selectedFile: File) => {
      const formData = new FormData();
      formData.append("schoolId", frontendConfig.schoolId);
      formData.append("file", selectedFile);
      return apiRequest<PreviewResponse>("/imports/preview", { method: "POST", body: formData });
    },
  });
  const confirmMutation = useMutation({
    mutationFn: ({ importBatchId, importToken }: { importBatchId: string; importToken: string }) =>
      apiRequest<ConfirmResponse>(`/imports/${importBatchId}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": importToken },
      }),
  });
  const errorReportMutation = useMutation({
    mutationFn: (importBatchId: string) => apiBlob(`/imports/${importBatchId}/error-report`),
  });
  const preview = previewMutation.data ?? null;
  const confirmation = confirmMutation.data ?? null;

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Vui lòng chọn tệp Excel.");
    if (!frontendConfig.schoolId) return setError("Chưa cấu hình mã trường để nhập dữ liệu.");
    setError("");
    confirmMutation.reset();
    try {
      await previewMutation.mutateAsync(file);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xem trước tệp.");
    }
  }

  async function handleConfirm() {
    if (!preview?.canConfirm) return;
    setError("");
    try {
      await confirmMutation.mutateAsync({ importBatchId: preview.importBatchId, importToken: preview.importToken });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xác nhận nhập dữ liệu.");
    }
  }

  async function handleDownloadErrorReport() {
    if (!preview || preview.errorCount === 0) return;
    setError("");
    try {
      const url = URL.createObjectURL(await errorReportMutation.mutateAsync(preview.importBatchId));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `import-error-report-${preview.importBatchId}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải báo cáo lỗi.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Dữ liệu đầu vào"
        title="Tải lên và kiểm tra dữ liệu"
        description="Xem trước, sửa lỗi theo dòng và chỉ xác nhận khi dữ liệu đạt chuẩn hợp đồng MVP."
        action={<span className="contract-pill">TC-IMP · TC-VAL · TC-CFM</span>}
      />
      <div className="stepper" aria-label="Tiến trình workflow">
        <span className="step active">
          <b>01</b> Nhập dữ liệu
        </span>
        <span className="step">
          <b>02</b> Kiểm tra
        </span>
        <span className="step">
          <b>03</b> Xác nhận
        </span>
        <span className="step">
          <b>04</b> Tối ưu
        </span>
      </div>
      <section className="panel import-panel" aria-labelledby="import-form-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Mẫu v1.0</p>
            <h2 id="import-form-title">Chọn tệp Excel để bắt đầu</h2>
          </div>
          <span className="quiet-badge">Kiểm thử trước khi ghi dữ liệu nghiệp vụ</span>
        </div>
        <form className="upload-form" onSubmit={handlePreview}>
          <label htmlFor="excel-file">Tệp Excel theo mẫu MVP</label>
          <div className="upload-controls">
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                previewMutation.reset();
                confirmMutation.reset();
                setError("");
              }}
            />
            <Button type="submit" disabled={previewMutation.isPending || !file}>
              {previewMutation.isPending ? "Đang đọc tệp..." : "Tải lên và xem trước"}
            </Button>
          </div>
          <p className="hint">Bắt buộc: Mã lớp, Mã môn, Mã giáo viên, Số tiết. Có thể thêm Mã phòng.</p>
        </form>
        {error ? (
          <div className="alert alert-error" role="alert">
            <strong>Không thể tiếp tục</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {preview ? (
          <PreviewPanel
            preview={preview}
            isConfirming={confirmMutation.isPending}
            isDownloadingErrorReport={errorReportMutation.isPending}
            onConfirm={handleConfirm}
            onDownloadErrorReport={handleDownloadErrorReport}
          />
        ) : null}
        {confirmation ? (
          <div className="alert alert-success" role="status">
            <strong>{confirmation.message}</strong>
            <span>{confirmation.validRowCount} dòng đã được ghi nhận.</span>
            {confirmation.auditLog ? <span>{confirmation.auditLog.message}</span> : null}
            <Button className="success-action" variant="outline" type="button" onClick={() => navigateTo("timetable")}>
              Mở khung thời khóa biểu →
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
