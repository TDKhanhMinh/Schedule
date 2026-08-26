import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../app/app-shell";
import { frontendConfig } from "../../config";
import { apiRequest, apiText } from "../../lib/api-client";
import { navigateTo } from "../../routing";

interface DashboardAuditEntry {
  id: string;
  action: string;
  entityType: string;
  actorId: string;
  createdAt: string;
}

interface DashboardSnapshot {
  readiness: { status: string; dependencies?: Record<string, string> };
  metricsText: string;
  auditLogs: DashboardAuditEntry[];
  fetchedAt: string;
}

function metricValue(metricsText: string, metricName: string, label?: string) {
  const line = metricsText
    .split("\n")
    .find((candidate) => candidate.startsWith(metricName) && (!label || candidate.includes(label)));
  const value = line?.match(/ ([0-9]+(?:\.[0-9]+)?)$/)?.[1];
  return value ? Number(value) : 0;
}

const auditActionLabels: Record<string, string> = {
  IMPORT_CONFIRMED: "Đã xác nhận nhập dữ liệu",
  IMPORT: "Nhập dữ liệu",
  APPROVE: "Phê duyệt",
  PUBLISH: "Công bố",
  LOCK: "Khóa",
  UNLOCK: "Mở khóa",
};

function auditActionLabel(action: string) {
  return auditActionLabels[action] ?? action;
}

async function fetchDashboard(signal: AbortSignal): Promise<DashboardSnapshot> {
  const [readiness, metricsText, auditLogs] = await Promise.all([
    apiRequest<DashboardSnapshot["readiness"]>("/health/ready", { signal }),
    apiText("/metrics", { signal }),
    apiRequest<DashboardAuditEntry[]>(`/schools/${encodeURIComponent(frontendConfig.schoolId)}/audit-logs?limit=12`, {
      signal,
    }),
  ]);
  return { readiness, metricsText, auditLogs, fetchedAt: new Date().toISOString() };
}

export function DashboardScreen() {
  const [auditQuery, setAuditQuery] = useState("");
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", frontendConfig.schoolId],
    queryFn: ({ signal }) => fetchDashboard(signal),
    enabled: Boolean(frontendConfig.schoolId),
  });
  const snapshot = dashboardQuery.data ?? null;
  const error = !frontendConfig.schoolId
    ? "Chưa cấu hình mã trường. Hãy đặt VITE_SCHOOL_ID trước khi sử dụng dữ liệu."
    : dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : "";
  const isLoading = dashboardQuery.isPending;

  const filteredAuditLogs = (snapshot?.auditLogs ?? []).filter((entry) =>
    `${entry.action} ${entry.entityType} ${entry.actorId}`.toLowerCase().includes(auditQuery.toLowerCase().trim()),
  );
  const queueCompleted = snapshot
    ? metricValue(snapshot.metricsText, "schedule_queue_events_total", 'event="COMPLETED"')
    : 0;
  const queueFailed = snapshot ? metricValue(snapshot.metricsText, "schedule_queue_events_total", 'event="FAILED"') : 0;
  const solverRuns = snapshot ? metricValue(snapshot.metricsText, "schedule_solver_runs_total") : 0;
  const importAudits = filteredAuditLogs.filter((entry) => entry.action === "IMPORT").length;

  return (
    <>
      <PageHeader
        eyebrow="Tổng quan không gian làm việc"
        title="Bảng điều khiển quản trị trường và vận hành."
        description="Theo dõi dữ liệu và trạng thái vận hành theo trường đã cấu hình."
        action={
          <button type="button" onClick={() => navigateTo("imports")}>
            + Nhập dữ liệu
          </button>
        }
      />
      <section className="dashboard-grid" aria-label="Tổng quan không gian làm việc">
        <article className="stat-card featured-card">
          <div className="card-kicker">Phạm vi trường</div>
          <h2>{frontendConfig.schoolId || "Chưa cấu hình"}</h2>
          <p>Dữ liệu được đọc từ API theo phạm vi trường hiện tại.</p>
          <button type="button" onClick={() => navigateTo("imports")}>
            Tải lên và xem trước <span aria-hidden="true">→</span>
          </button>
          <button
            className="button-secondary dashboard-secondary-action"
            type="button"
            onClick={() => navigateTo("master-data")}
          >
            Nhập dữ liệu danh mục
          </button>
        </article>
        <article className="stat-card">
          <div className="stat-icon blue" aria-hidden="true">
            01
          </div>
          <span className="card-kicker">Nhập dữ liệu / nhật ký</span>
          <strong>{isLoading ? "Đang tải…" : `${importAudits} sự kiện`}</strong>
          <small>Nhật ký trong cửa sổ hiện tại</small>
        </article>
        <article className="stat-card">
          <div className="stat-icon amber" aria-hidden="true">
            02
          </div>
          <span className="card-kicker">Lần tối ưu gần nhất</span>
          <strong>{isLoading ? "Đang tải…" : `${solverRuns} lần chạy`}</strong>
          <small>Chỉ số bộ tối ưu trong tiến trình</small>
        </article>
        <article className="stat-card">
          <div className="stat-icon green" aria-hidden="true">
            03
          </div>
          <span className="card-kicker">Sức khỏe hàng đợi</span>
          <strong>{isLoading ? "Đang tải…" : `${queueCompleted} hoàn tất`}</strong>
          <small>{queueFailed} lỗi · làm mới khi mở bảng điều khiển</small>
        </article>
      </section>
      <section className="content-grid" aria-label="Vận hành và nhật ký gần đây">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Vận hành</p>
              <h2>Sức khỏe và độ mới dữ liệu</h2>
            </div>
            <span className="health-chip">
              {isLoading ? "Đang tải" : snapshot?.readiness.status === "ready" ? "Sẵn sàng" : "Kiểm tra lại"}
            </span>
          </div>
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="ops-grid">
            <div className="ops-card">
              <span>PostgreSQL</span>
              <strong>{snapshot?.readiness.dependencies?.postgres ?? "—"}</strong>
            </div>
            <div className="ops-card">
              <span>Redis</span>
              <strong>{snapshot?.readiness.dependencies?.redis ?? "—"}</strong>
            </div>
            <div className="ops-card">
              <span>Người thực hiện / vai trò</span>
              <strong>{frontendConfig.actorRole}</strong>
            </div>
            <div className="ops-card">
              <span>Độ mới dữ liệu</span>
              <strong>{snapshot ? new Date(snapshot.fetchedAt).toLocaleTimeString("vi-VN") : "—"}</strong>
            </div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Nhật ký theo phạm vi</p>
              <h2>Nhật ký gần đây</h2>
            </div>
            <label className="audit-search">
              <span className="sr-only">Tìm nhật ký</span>
              <input
                value={auditQuery}
                onChange={(event) => setAuditQuery(event.target.value)}
                placeholder="Tìm hành động / người thực hiện"
              />
            </label>
          </div>
          <div className="audit-list">
            {filteredAuditLogs.length === 0 ? (
              <p className="small-note">Chưa có nhật ký phù hợp.</p>
            ) : (
              filteredAuditLogs.slice(0, 8).map((entry) => (
                <div className="audit-row" key={entry.id}>
                  <div>
                    <strong>{auditActionLabel(entry.action)}</strong>
                    <span>
                      {entry.entityType.toLowerCase()} · {entry.actorId}
                    </span>
                  </div>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("vi-VN")}</time>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </>
  );
}
