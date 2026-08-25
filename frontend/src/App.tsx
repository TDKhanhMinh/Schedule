import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SolveStatus } from "@schedule/backend/contracts";
import { authHeaders, frontendConfig } from "./config";
import { navigateTo, useAppRoute, type AppRoute } from "./routing";

type ApiStatus = "checking" | "online" | "offline";

interface ImportIssue {
  sheet: string;
  row: number;
  column: string;
  cell: string;
  field: string;
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  value: string | number | null;
}

type ValidationStatus = "VALID" | "WARNING" | "INVALID";

interface NormalizedPreviewValue {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  requiredSessions: number;
  roomId?: string;
}

interface ColumnMapping {
  column: string;
  header: string;
  field: string | null;
  required: boolean;
}

interface SheetSummary {
  sheet: string;
  index: number;
  status: "IMPORTED" | "IGNORED";
  rowCount: number;
  columnCount: number;
  validRowCount: number;
  warningCount: number;
  errorCount: number;
}

interface PreviewRow {
  rowNumber: number;
  values: Record<string, string | number | null>;
  normalized: NormalizedPreviewValue | null;
  status: ValidationStatus;
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

interface PreviewResponse {
  importBatchId: string;
  status: string;
  templateVersion: string;
  fileChecksum: string;
  importToken: string;
  filename: string;
  columns: string[];
  columnMappings: ColumnMapping[];
  sheetSummaries: SheetSummary[];
  rowCount: number;
  validRowCount: number;
  errorCount: number;
  warningCount: number;
  canConfirm: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  rows: PreviewRow[];
}

interface ConfirmResponse {
  importBatchId: string;
  status: string;
  templateVersion: string;
  fileChecksum: string | null;
  importToken: string | null;
  message: string;
  validRowCount: number;
  auditLog: {
    actorId: string;
    message: string;
    createdAt: string;
  } | null;
}

const architecture = [
  ["Web", "React + TypeScript + Vite"],
  ["API/core", "NestJS + TypeScript"],
  ["Nguồn dữ liệu", "PostgreSQL"],
  ["Điều phối job", "Redis + BullMQ"],
  ["Tối ưu", "Python + OR-Tools CP-SAT"],
] as const;

const navigation: Array<{
  route: AppRoute;
  label: string;
  shortLabel: string;
}> = [
  { route: "dashboard", label: "Tổng quan", shortLabel: "Home" },
  { route: "imports", label: "Nhập dữ liệu", shortLabel: "Import" },
  { route: "timetable", label: "Thời khóa biểu", shortLabel: "Schedule" },
];

function readApiMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}

function useApiStatus() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(frontendConfig.apiBaseUrl + "/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        setApiStatus("online");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiStatus("offline");
      });

    return () => controller.abort();
  }, []);

  return apiStatus;
}

function apiStatusLabel(apiStatus: ApiStatus) {
  if (apiStatus === "checking") return "đang kiểm tra";
  if (apiStatus === "online") return "đang hoạt động";
  return "chưa kết nối";
}

function AppShell({ route, apiStatus, children }: { route: AppRoute; apiStatus: ApiStatus; children: ReactNode }) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigateTo("dashboard")} aria-label="Về tổng quan">
          <span className="brand-mark" aria-hidden="true">
            ST
          </span>
          <span>
            <strong>School Timetable</strong>
            <small>Optimizer · MVP-0.1.0</small>
          </span>
        </button>
        <div className="topbar-meta">
          <span className={"status status-" + apiStatus}>
            <span aria-hidden="true" /> API {apiStatusLabel(apiStatus)}
          </span>
          <span className="user-chip">QC local</span>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar" aria-label="Điều hướng chính">
          <p className="sidebar-label">Workspace</p>
          <nav>
            {navigation.map((item) => (
              <a
                className={route === item.route ? "nav-link active" : "nav-link"}
                href={item.route === "dashboard" ? "/" : "/" + item.route}
                aria-current={route === item.route ? "page" : undefined}
                key={item.route}
                onClick={(event) => {
                  event.preventDefault();
                  navigateTo(item.route);
                }}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.shortLabel.slice(0, 1)}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="eyebrow">Scope</span>
            <strong>THCS / THPT</strong>
            <small>Web-first · một trường pilot</small>
          </div>
        </aside>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      {action ? <div className="page-header-action">{action}</div> : null}
    </div>
  );
}

function DashboardScreen() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace overview"
        title="Bắt đầu một thời khóa biểu rõ ràng."
        description="Chuẩn hóa dữ liệu, chạy solver và theo dõi bản draft từ một workspace duy nhất."
        action={
          <button type="button" onClick={() => navigateTo("imports")}>
            + Nhập dữ liệu
          </button>
        }
      />

      <section className="dashboard-grid" aria-label="Tổng quan workspace">
        <article className="stat-card featured-card">
          <div className="card-kicker">Next step</div>
          <h2>Đưa dữ liệu vào hệ thống</h2>
          <p>Upload workbook theo template MVP hoặc bắt đầu với nhập tay.</p>
          <button type="button" onClick={() => navigateTo("imports")}>
            Upload & Preview <span aria-hidden="true">→</span>
          </button>
        </article>
        <article className="stat-card">
          <div className="stat-icon blue" aria-hidden="true">
            01
          </div>
          <span className="card-kicker">Data input</span>
          <strong>Chưa có batch</strong>
          <small>0 dòng · 0 lỗi</small>
        </article>
        <article className="stat-card">
          <div className="stat-icon amber" aria-hidden="true">
            02
          </div>
          <span className="card-kicker">Latest solve</span>
          <strong>Chưa chạy</strong>
          <small>Chờ dataset và rule profile</small>
        </article>
        <article className="stat-card">
          <div className="stat-icon green" aria-hidden="true">
            03
          </div>
          <span className="card-kicker">Published version</span>
          <strong>Chưa có</strong>
          <small>Approve → Lock → Publish</small>
        </article>
      </section>

      <section className="content-grid" aria-label="Architecture và hoạt động gần đây">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Hoạt động gần đây</h2>
            </div>
            <span className="quiet-badge">Empty state</span>
          </div>
          <div className="empty-inline">
            <span className="empty-icon" aria-hidden="true">
              ◎
            </span>
            <strong>Chưa có hoạt động</strong>
            <p>Upload hoặc nhập requirement đầu tiên để bắt đầu workflow.</p>
            <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
              Mở import
            </button>
          </div>
        </article>
        <article className="panel dark-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Architecture baseline</p>
              <h2>Các lớp đã chốt</h2>
            </div>
          </div>
          <dl className="architecture-list">
            {architecture.map(([label, value]) => (
              <div className="architecture-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </>
  );
}

function ImportScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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
      formData.append("schoolId", frontendConfig.schoolId);
      formData.append("file", file);
      const response = await fetch(frontendConfig.apiBaseUrl + "/imports/preview", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const payload: unknown = await response.json();
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
      const response = await fetch(frontendConfig.apiBaseUrl + "/imports/" + preview.importBatchId + "/confirm", {
        method: "POST",
        headers: { ...authHeaders(), "Idempotency-Key": preview.importToken },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readApiMessage(payload));
      setConfirmation(payload as ConfirmResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể Confirm Import.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Step 01 · Input"
        title="Upload & Data Validation"
        description="Preview trước, sửa lỗi theo dòng và chỉ Confirm khi dữ liệu đạt chuẩn contract MVP."
        action={<span className="contract-pill">TC-IMP · TC-VAL · TC-CFM</span>}
      />
      <div className="stepper" aria-label="Tiến trình workflow">
        <span className="step active">
          <b>01</b> Input
        </span>
        <span className="step">
          <b>02</b> Validate
        </span>
        <span className="step">
          <b>03</b> Confirm
        </span>
        <span className="step">
          <b>04</b> Solve
        </span>
      </div>

      <section className="panel import-panel" aria-labelledby="import-form-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Template v1.0</p>
            <h2 id="import-form-title">Chọn workbook để bắt đầu</h2>
          </div>
          <span className="quiet-badge">Staging trước khi ghi domain</span>
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

        {preview ? <PreviewPanel preview={preview} isConfirming={isConfirming} onConfirm={handleConfirm} /> : null}

        {confirmation ? (
          <div className="alert alert-success" role="status">
            <strong>{confirmation.message}</strong>
            <span>{confirmation.validRowCount} dòng đã được ghi nhận.</span>
            {confirmation.auditLog ? <span>{confirmation.auditLog.message}</span> : null}
            <button className="button-secondary success-action" type="button" onClick={() => navigateTo("timetable")}>
              Mở timetable skeleton →
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function PreviewPanel({
  preview,
  isConfirming,
  onConfirm,
}: {
  preview: PreviewResponse;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <section className="preview-panel" aria-live="polite">
      <div className="preview-summary">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{preview.filename}</h2>
          <p className="small-note">
            Batch: <code>{preview.importBatchId}</code>
          </p>
        </div>
        <div className={preview.canConfirm ? "validation-badge valid" : "validation-badge invalid"}>
          {preview.canConfirm ? "Sẵn sàng Confirm" : "Cần sửa lỗi"}
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
          <h3>Sheet summary</h3>
          {preview.sheetSummaries.map((summary) => (
            <div className="sheet-summary" key={summary.sheet}>
              <div>
                <strong>{summary.sheet}</strong>
                <small>
                  Sheet {summary.index} · {summary.columnCount} cột · {summary.rowCount} dòng
                </small>
              </div>
              <span className={summary.status === "IMPORTED" ? "validation-status valid" : "validation-status ignored"}>
                {summary.status === "IMPORTED" ? "Được import" : "Bỏ qua"}
              </span>
            </div>
          ))}
        </div>
        <div className="preview-meta-card">
          <h3>Column mapping</h3>
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
            <div className="row-error" key={issue.row + "-" + issue.field + "-" + index}>
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
            <div className="row-warning" key={issue.row + "-" + issue.field + "-" + index}>
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
        {isConfirming ? "Đang import..." : "Confirm Import"}
      </button>
    </section>
  );
}

function TimetableScreen() {
  const exampleStatus: SolveStatus = "FEASIBLE";

  return (
    <>
      <PageHeader
        eyebrow="Step 04 · Solve & review"
        title="Thời khóa biểu"
        description="Khu vực review theo lớp, giáo viên và phòng sẽ hiển thị sau khi một solve job hoàn tất."
        action={
          <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
            ← Quay lại import
          </button>
        }
      />
      <section className="panel timetable-shell" aria-labelledby="timetable-title">
        <div className="timetable-toolbar">
          <div>
            <p className="eyebrow">Draft workspace</p>
            <h2 id="timetable-title">Chưa có solution để review</h2>
          </div>
          <div className="toolbar-filters">
            <button className="filter-button" type="button" disabled>
              {" "}
              Theo lớp ▾{" "}
            </button>
            <button className="filter-button" type="button" disabled>
              {" "}
              Tuần 1 ▾{" "}
            </button>
          </div>
        </div>
        <div className="timetable-empty">
          <div className="calendar-icon" aria-hidden="true">
            ▦
          </div>
          <h3>Grid sẽ xuất hiện sau bước Solve</h3>
          <p>
            Import và Confirm dữ liệu trước, sau đó hệ thống sẽ enqueue job qua BullMQ và trả về assignments cùng
            diagnostics.
          </p>
          <button type="button" onClick={() => navigateTo("imports")}>
            Bắt đầu từ Import →
          </button>
          <small>
            Contract sample status: <code>{exampleStatus}</code>
          </small>
        </div>
      </section>
    </>
  );
}

export default function App() {
  const route = useAppRoute();
  const apiStatus = useApiStatus();

  const screen =
    route === "imports" ? <ImportScreen /> : route === "timetable" ? <TimetableScreen /> : <DashboardScreen />;

  return (
    <AppShell route={route} apiStatus={apiStatus}>
      {screen}
    </AppShell>
  );
}
