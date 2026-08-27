import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MasterDataImportEntity, MasterDataImportPreview } from "@schedule/backend/contracts";
import { frontendConfig } from "../../config";
import {
  confirmMasterDataImport,
  downloadMasterDataErrorReport,
  downloadMasterDataTemplate,
  MasterDataImportApiError,
  previewMasterDataImport,
  saveDownloadedFile,
} from "./master-data-import-api";

const labels: Record<MasterDataImportEntity, string> = {
  class: "Lớp",
  teacher: "Giáo viên",
  subject: "Môn học",
  room: "Phòng học",
  teacherSubjectGrade: "Phân công chuyên môn",
  homeroom: "Phân công chủ nhiệm",
};

export function MasterDataImportActions({
  entity,
  canImport,
  onImported,
}: {
  entity: MasterDataImportEntity;
  canImport: boolean;
  onImported: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MasterDataImportPreview | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const templateMutation = useMutation({
    mutationFn: () => downloadMasterDataTemplate(entity),
    onSuccess: ({ blob, filename }) => saveDownloadedFile(blob, filename),
    onError: (requestError) => setError(errorMessage(requestError)),
  });
  const previewMutation = useMutation({
    mutationFn: (selectedFile: File) => previewMasterDataImport(entity, selectedFile),
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setError("");
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Chưa có bản xem trước để xác nhận.");
      return confirmMasterDataImport(preview);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["master-data", "base", frontendConfig.schoolId] });
      await queryClient.invalidateQueries({ queryKey: ["homeroom-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary"] });
      setOpen(false);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImported(`${result.message} Đã tạo ${result.createCount} và cập nhật ${result.updateCount} bản ghi.`);
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  });
  const errorReportMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Chưa có báo cáo lỗi để tải.");
      return downloadMasterDataErrorReport(preview);
    },
    onSuccess: ({ blob, filename }) => saveDownloadedFile(blob, filename),
    onError: (requestError) => setError(errorMessage(requestError)),
  });

  function openDialog() {
    setError("");
    setPreview(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOpen(true);
  }

  function closeDialog() {
    if (previewMutation.isPending || confirmMutation.isPending) return;
    setOpen(false);
    setError("");
  }

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setError("");
  }

  function handlePreview() {
    if (!file) {
      setError("Vui lòng chọn tệp Excel trước khi xem trước.");
      return;
    }
    previewMutation.mutate(file);
  }

  return (
    <div className="master-import-actions">
      <Button
        variant="outline"
        type="button"
        onClick={() => templateMutation.mutate()}
        disabled={templateMutation.isPending}
      >
        <FileDown /> {templateMutation.isPending ? "Đang tải…" : "Tải file mẫu"}
      </Button>
      <Button type="button" onClick={openDialog} disabled={!canImport}>
        <Upload /> Nhập Excel
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="master-import-dialog" aria-describedby={`${entity}-import-description`}>
          <DialogHeader>
            <DialogTitle>Nhập Excel: {labels[entity]}</DialogTitle>
            <DialogDescription id={`${entity}-import-description`}>
              Chọn đúng file mẫu, xem trước dữ liệu và chỉ xác nhận khi không còn lỗi.
            </DialogDescription>
          </DialogHeader>
          <div className="master-import-dialog-body">
            <label className="master-import-file-field">
              <span>File Excel {labels[entity].toLowerCase()}</span>
              <input
                ref={fileInputRef}
                type="file"
                name={`masterDataFile-${entity}`}
                accept=".xlsx,.xlsm"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                disabled={previewMutation.isPending || confirmMutation.isPending}
              />
            </label>
            {file ? <p className="master-import-file-name">Đã chọn: {file.name}</p> : null}
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Không thể tiếp tục</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {!canImport ? (
              <p className="master-import-read-only">
                Vai trò hiện tại chỉ được tải template, không được upload hoặc xác nhận.
              </p>
            ) : null}
            {preview ? <ImportPreviewSummary preview={preview} /> : null}
          </div>
          <DialogFooter>
            {preview?.errorCount ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => errorReportMutation.mutate()}
                disabled={errorReportMutation.isPending}
              >
                <FileSpreadsheet /> {errorReportMutation.isPending ? "Đang tạo báo cáo…" : "Tải báo cáo lỗi"}
              </Button>
            ) : null}
            <Button className="dialog-cancel" variant="outline" type="button" onClick={closeDialog}>
              Hủy
            </Button>
            {!preview ? (
              <Button type="button" onClick={handlePreview} disabled={!canImport || !file || previewMutation.isPending}>
                {previewMutation.isPending ? "Đang đọc…" : "Xem trước"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => confirmMutation.mutate()}
                disabled={!canImport || !preview.canConfirm || confirmMutation.isPending}
              >
                {confirmMutation.isPending ? "Đang xác nhận…" : "Xác nhận nhập"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportPreviewSummary({ preview }: { preview: MasterDataImportPreview }) {
  return (
    <div className="master-import-preview" aria-live="polite">
      <div className="master-import-preview-heading">
        <div>
          <strong>Xem trước {labels[preview.entity]}</strong>
          <small>{preview.filename}</small>
        </div>
        <Badge variant={preview.canConfirm ? "default" : "destructive"}>
          {preview.canConfirm ? "Sẵn sàng xác nhận" : "Cần sửa lỗi"}
        </Badge>
      </div>
      <div className="master-import-metrics" aria-label="Tóm tắt nhập Excel">
        <span>
          <b>{preview.rowCount}</b> dòng
        </span>
        <span>
          <b>{preview.createCount}</b> tạo mới
        </span>
        <span>
          <b>{preview.updateCount}</b> cập nhật
        </span>
        <span>
          <b>{preview.errorCount}</b> lỗi
        </span>
      </div>
      {preview.errors.length > 0 ? (
        <div className="master-import-issues" role="alert">
          {preview.errors.slice(0, 8).map((issue, index) => (
            <p key={`${issue.row}-${issue.code}-${index}`}>
              Dòng {issue.row}: {issue.message} <small>{issue.remediationHint}</small>
            </p>
          ))}
          {preview.errors.length > 8 ? <small>Còn {preview.errors.length - 8} lỗi khác trong báo cáo.</small> : null}
        </div>
      ) : null}
      <div className="master-import-preview-table">
        <table>
          <thead>
            <tr>
              <th>Dòng</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
              <th>Dữ liệu</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 12).map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>{row.status === "VALID" ? "Hợp lệ" : row.status === "WARNING" ? "Cảnh báo" : "Lỗi"}</td>
                <td>{row.operation ?? "Không thực hiện"}</td>
                <td>
                  {Object.values(row.values)
                    .filter((value) => value !== null && value !== "")
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.rows.length > 12 ? (
          <small>Đang hiển thị 12 dòng đầu; toàn bộ kết quả đã được kiểm tra ở backend.</small>
        ) : null}
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof MasterDataImportApiError) return error.message;
  return error instanceof Error ? error.message : "Không thể thực hiện nhập Excel.";
}
