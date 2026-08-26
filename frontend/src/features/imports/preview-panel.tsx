import type { PreviewResponse } from "./import-types";

export function PreviewPanel({
  preview,
  isConfirming,
  isDownloadingErrorReport,
  onConfirm,
  onDownloadErrorReport,
}: {
  preview: PreviewResponse;
  isConfirming: boolean;
  isDownloadingErrorReport: boolean;
  onConfirm: () => void;
  onDownloadErrorReport: () => void;
}) {
  return (
    <section className="preview-panel" aria-live="polite">
      <div className="preview-summary">
        <div>
          <p className="eyebrow">Xem trước</p>
          <h2>{preview.filename}</h2>
          <p className="small-note">
            Lô nhập: <code>{preview.importBatchId}</code>
          </p>
        </div>
        <div className={preview.canConfirm ? "validation-badge valid" : "validation-badge invalid"}>
          {preview.canConfirm ? "Sẵn sàng xác nhận" : "Cần sửa lỗi"}
        </div>
      </div>
      <div className="metrics">
        <span>
          <b>{preview.rowCount}</b> dòng
        </span>
        <span>
          <b>{preview.validRowCount}</b> hợp lệ
        </span>
        <span>
          <b>{preview.errorCount}</b> lỗi
        </span>
        <span>
          <b>{preview.warningCount}</b> cảnh báo
        </span>
      </div>
      <div className="preview-meta-grid">
        <div className="preview-meta-card">
          <h3>Tóm tắt trang tính</h3>
          {preview.sheetSummaries.map((summary) => (
            <div className="sheet-summary" key={summary.sheet}>
              <div>
                <strong>{summary.sheet}</strong>
                <small>
                  Trang tính {summary.index} · {summary.columnCount} cột · {summary.rowCount} dòng
                </small>
              </div>
              <span className={`validation-status ${summary.status === "IMPORTED" ? "valid" : "ignored"}`}>
                {summary.status === "IMPORTED" ? "Đã nhập" : "Bỏ qua"}
              </span>
            </div>
          ))}
        </div>
        <div className="preview-meta-card">
          <h3>Ánh xạ cột</h3>
          <div className="mapping-list">
            {preview.columnMappings.map((mapping) => (
              <span key={mapping.column}>
                <b>{mapping.column}</b> {mapping.header} → {mapping.field ?? "Không sử dụng"}
                {mapping.required ? " · bắt buộc" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      {preview.errors.length > 0 ? (
        <div className="error-list">
          {preview.errors.map((issue, index) => (
            <div className="row-error" key={`${issue.row}-${issue.field}-${index}`}>
              <b>
                {issue.sheet} · {issue.cell} · {issue.code}
              </b>
              <span>
                {issue.field}: {issue.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {preview.warnings.length > 0 ? (
        <div className="warning-list">
          {preview.warnings.map((issue, index) => (
            <div className="row-warning" key={`${issue.row}-${issue.field}-${index}`}>
              <b>
                {issue.sheet} · {issue.cell} · {issue.code}
              </b>
              <span>
                {issue.field}: {issue.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dòng</th>
              <th>Mã lớp</th>
              <th>Mã môn</th>
              <th>Mã giáo viên</th>
              <th>Số tiết</th>
              <th>Giá trị chuẩn hóa</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr
                className={row.status === "INVALID" ? "has-error" : row.status === "WARNING" ? "has-warning" : ""}
                key={row.rowNumber}
              >
                <td>{row.rowNumber}</td>
                <td>{row.values.classCode ?? "—"}</td>
                <td>{row.values.subjectCode ?? "—"}</td>
                <td>{row.values.teacherCode ?? "—"}</td>
                <td>{row.values.requiredSessions ?? "—"}</td>
                <td>
                  <code className="normalized-values">{row.normalized ? JSON.stringify(row.normalized) : "—"}</code>
                </td>
                <td>
                  <span className={`validation-status ${row.status.toLowerCase()}`}>
                    {row.status === "INVALID" ? "Lỗi" : row.status === "WARNING" ? "Cảnh báo" : "Hợp lệ"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="confirm-button"
        type="button"
        disabled={!preview.canConfirm || isConfirming}
        onClick={onConfirm}
      >
        {isConfirming ? "Đang nhập..." : "Xác nhận nhập dữ liệu"}
      </button>
      {preview.errorCount > 0 ? (
        <button
          className="button-secondary error-report-button"
          type="button"
          disabled={isDownloadingErrorReport}
          onClick={onDownloadErrorReport}
        >
          {isDownloadingErrorReport ? "Đang tạo báo cáo..." : "Tải báo cáo lỗi Excel"}
        </button>
      ) : null}
    </section>
  );
}
