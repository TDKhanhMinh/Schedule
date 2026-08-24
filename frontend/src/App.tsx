import { useEffect, useState, type FormEvent } from "react";
import type { SolveStatus } from "@schedule/backend/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const DEMO_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

const architecture = [
  ["Web", "React + TypeScript + Vite"],
  ["API/core", "NestJS + TypeScript"],
  ["Nguồn dữ liệu", "PostgreSQL"],
  ["Điều phối job", "Redis + BullMQ"],
  ["Tối ưu", "Python + OR-Tools CP-SAT"]
] as const;

type ApiStatus = "checking" | "online" | "offline";

interface ImportIssue {
  row: number;
  field: string;
  code: string;
  message: string;
}

interface PreviewRow {
  rowNumber: number;
  values: Record<string, string | number | null>;
  errors: ImportIssue[];
}

interface PreviewResponse {
  importBatchId: string;
  status: string;
  filename: string;
  rowCount: number;
  validRowCount: number;
  errorCount: number;
  canConfirm: boolean;
  errors: ImportIssue[];
  rows: PreviewRow[];
}

interface ConfirmResponse {
  importBatchId: string;
  status: string;
  message: string;
  validRowCount: number;
  auditLog: {
    actorId: string;
    message: string;
    createdAt: string;
  } | null;
}

function readApiMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}

export default function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [exampleStatus] = useState<SolveStatus>("FEASIBLE");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    fetch(API_BASE + "/health")
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        setApiStatus("online");
      })
      .catch(() => setApiStatus("offline"));
  }, []);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Vui lòng chọn file Excel.");
      return;
    }

    setError("");
    setConfirmation(null);
    setPreview(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("schoolId", DEMO_SCHOOL_ID);
      formData.append("file", file);
      const response = await fetch(API_BASE + "/imports/preview", {
        method: "POST",
        headers: { "x-user-id": "qc-demo-user" },
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readApiMessage(payload));
      setPreview(payload as PreviewResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể preview file.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleConfirm() {
    if (!preview?.canConfirm) return;
    setError("");
    setIsConfirming(true);
    try {
      const response = await fetch(API_BASE + "/imports/" + preview.importBatchId + "/confirm", {
        method: "POST",
        headers: { "x-user-id": "qc-demo-user" }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readApiMessage(payload));
      setConfirmation(payload as ConfirmResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể Confirm Import.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">V0.1 · Upload & Data Validation</p>
        <h1>School Timetable Optimizer</h1>
        <p className="lead">
          Upload Excel, xem trước dữ liệu, phát hiện lỗi theo từng dòng và xác nhận import
          trước khi ghi vào PostgreSQL.
        </p>
        <div className={"status status-" + apiStatus}>
          <span aria-hidden="true" />
          API {apiStatus === "checking" ? "đang kiểm tra" : apiStatus === "online" ? "đang hoạt động" : "chưa kết nối"}
        </div>
      </section>

      <section className="workflow" aria-labelledby="import-title">
        <div className="workflow-heading">
          <div>
            <p className="eyebrow">QC workflow</p>
            <h2 id="import-title">Upload & Data Validation</h2>
          </div>
          <span className="contract-pill">TC-IMP · TC-VAL · TC-CFM</span>
        </div>

        <form className="upload-form" onSubmit={handlePreview}>
          <label htmlFor="excel-file">File Excel theo template MVP</label>
          <div className="upload-controls">
            <input
              id="excel-file"
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setConfirmation(null);
                setError("");
              }}
            />
            <button type="submit" disabled={isUploading || !file}>
              {isUploading ? "Đang đọc file..." : "Upload & Preview"}
            </button>
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
          <section className="preview-panel" aria-live="polite">
            <div className="preview-summary">
              <div>
                <p className="eyebrow">Preview</p>
                <h3>{preview.filename}</h3>
              </div>
              <div className={preview.canConfirm ? "validation-badge valid" : "validation-badge invalid"}>
                {preview.canConfirm ? "Sẵn sàng Confirm" : "Cần sửa lỗi"}
              </div>
            </div>
            <div className="metrics">
              <span><b>{preview.rowCount}</b> dòng</span>
              <span><b>{preview.validRowCount}</b> hợp lệ</span>
              <span><b>{preview.errorCount}</b> lỗi</span>
            </div>

            {preview.errors.length > 0 ? (
              <div className="error-list">
                {preview.errors.map((issue, index) => (
                  <div className="row-error" key={issue.row + "-" + issue.field + "-" + index}>
                    <b>Dòng {issue.row} · {issue.field}</b>
                    <span>{issue.message}</span>
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
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr className={row.errors.length > 0 ? "has-error" : ""} key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.values.classCode || "—"}</td>
                      <td>{row.values.subjectCode || "—"}</td>
                      <td>{row.values.teacherCode || "—"}</td>
                      <td>{row.values.requiredSessions || "—"}</td>
                      <td>{row.errors.length > 0 ? "Lỗi" : "Hợp lệ"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="confirm-button" type="button" disabled={!preview.canConfirm || isConfirming} onClick={handleConfirm}>
              {isConfirming ? "Đang import..." : "Confirm Import"}
            </button>
          </section>
        ) : null}

        {confirmation ? (
          <div className="alert alert-success" role="status">
            <strong>{confirmation.message}</strong>
            <span>{confirmation.validRowCount} dòng đã được ghi nhận.</span>
            {confirmation.auditLog ? <span>{confirmation.auditLog.message}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="grid" aria-label="Architecture baseline">
        <article className="card">
          <p className="eyebrow">Architecture</p>
          <h2>Các lớp đã chốt</h2>
          <dl>
            {architecture.map(([label, value]) => (
              <div className="row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="card accent-card">
          <p className="eyebrow">Scope guardrail</p>
          <h2>Phạm vi MVP</h2>
          <ul>
            <li>THCS/THPT, web-first</li>
            <li>Không lớp ghép/lớp tách</li>
            <li>Không desktop/offline</li>
            <li>Không AI làm solver lõi</li>
          </ul>
          <p className="small-note">Contract sample status: <code>{exampleStatus}</code></p>
        </article>
      </section>
    </main>
  );
}
