import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Layers3,
  ListChecks,
  RefreshCw,
  Server,
  School,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../app/app-shell";
import { useWorkspace } from "../../app/workspace-provider";
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

interface DashboardAction {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: "info" | "warning" | "success";
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

const auditActionLabels: Record<string, string> = {
  IMPORT_CONFIRMED: "Đã xác nhận nhập dữ liệu",
  IMPORT: "Nhập dữ liệu",
  APPROVE: "Phê duyệt",
  PUBLISH: "Công bố",
  LOCK: "Khóa",
  UNLOCK: "Mở khóa",
};

const auditActionLabel = (action: string) => auditActionLabels[action] ?? action;

function metricValue(metricsText: string, metricName: string, label?: string) {
  const line = metricsText
    .split("\n")
    .find((candidate) => candidate.startsWith(metricName) && (!label || candidate.includes(label)));
  const value = line?.match(/ ([0-9]+(?:\.[0-9]+)?)$/)?.[1];
  return value ? Number(value) : 0;
}

async function fetchDashboard(signal: AbortSignal, schoolId: string): Promise<DashboardSnapshot> {
  const [readiness, metricsText, auditLogs] = await Promise.all([
    apiRequest<DashboardSnapshot["readiness"]>("/health/ready", { signal }),
    apiText("/metrics", { signal }),
    apiRequest<DashboardAuditEntry[]>(`/schools/${encodeURIComponent(schoolId)}/audit-logs?limit=12`, { signal }),
  ]);
  return { readiness, metricsText, auditLogs, fetchedAt: new Date().toISOString() };
}

export function DashboardScreen() {
  const { context, periods, schoolId, academicPeriodId } = useWorkspace();
  const [auditQuery, setAuditQuery] = useState("");
  const selectedSchool = context?.schools.find((school) => school.id === schoolId);
  const selectedPeriod = periods.find((period) => period.id === academicPeriodId);
  const canImport = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "SCHEDULER";
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", schoolId],
    queryFn: ({ signal }) => fetchDashboard(signal, schoolId),
    enabled: Boolean(schoolId),
  });
  const snapshot = dashboardQuery.data;
  const error = !schoolId
    ? "Chưa cấu hình mã trường. Hãy chọn trường trong header hoặc đặt VITE_SCHOOL_ID."
    : dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : "";
  const isLoading = dashboardQuery.isPending && Boolean(schoolId);
  const isRefreshing = dashboardQuery.isFetching && !dashboardQuery.isPending;
  const filteredAuditLogs = (snapshot?.auditLogs ?? []).filter((entry) =>
    `${entry.action} ${entry.entityType} ${entry.actorId}`.toLowerCase().includes(auditQuery.toLowerCase().trim()),
  );
  const queueCompleted = snapshot
    ? metricValue(snapshot.metricsText, "schedule_queue_events_total", 'event="COMPLETED"')
    : 0;
  const queueFailed = snapshot ? metricValue(snapshot.metricsText, "schedule_queue_events_total", 'event="FAILED"') : 0;
  const solverRuns = snapshot ? metricValue(snapshot.metricsText, "schedule_solver_runs_total") : 0;
  const importAudits = filteredAuditLogs.filter((entry) => entry.action === "IMPORT").length;
  const actionItems = buildActionItems({
    canImport,
    hasError: Boolean(dashboardQuery.error),
    hasSchool: Boolean(schoolId),
    queueFailed,
    refetch: () => void dashboardQuery.refetch(),
  });

  return (
    <div className="dashboard-screen">
      <PageHeader
        eyebrow="Tổng quan không gian làm việc"
        title="Bảng điều khiển quản trị trường và vận hành"
        description="Theo dõi dữ liệu, tác vụ và phiên bản theo trường và năm học đã chọn."
        action={
          <div className="dashboard-header-actions">
            <Button onClick={() => navigateTo("imports")} disabled={!canImport}>
              <FileSpreadsheet /> Nhập dữ liệu
            </Button>
            <Button variant="outline" onClick={() => navigateTo("timetable")}>
              <CalendarDays /> Xem lịch
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert className="dashboard-error" variant="destructive">
          <Server />
          <AlertTitle>Chưa thể tải toàn bộ dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="dashboard-command-grid" aria-label="Bối cảnh và việc cần xử lý">
        <Card className="dashboard-scope-panel">
          <CardHeader>
            <div className="dashboard-section-kicker">Bối cảnh hiện tại</div>
            <CardTitle>{selectedSchool?.name ?? schoolId ?? "Chưa cấu hình trường"}</CardTitle>
            <CardDescription>Dữ liệu vận hành được đọc theo trường và năm học đang chọn.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="dashboard-scope-list">
              <ScopeItem icon={<School />} label="Trường" value={selectedSchool?.code ?? schoolId ?? "Chưa có"} />
              <ScopeItem icon={<Table2 />} label="Năm học" value={selectedPeriod?.name ?? "Chưa có"} />
              <ScopeItem
                icon={<Layers3 />}
                label="Phiên bản thời khóa biểu"
                value={frontendConfig.scheduleVersionId || "Chưa cấu hình"}
              />
            </div>
            <div className="dashboard-scope-actions">
              <Button variant="outline" onClick={() => navigateTo("master-data")}>
                <Database /> Quản lý danh mục
              </Button>
              <Button variant="ghost" onClick={() => navigateTo("timetable")}>
                Mở thời khóa biểu <CalendarDays />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard-action-panel">
          <CardHeader className="dashboard-panel-header">
            <div>
              <div className="dashboard-section-kicker">Ưu tiên xử lý</div>
              <CardTitle>Việc cần xử lý</CardTitle>
            </div>
            <Badge variant={actionItems.some((item) => item.tone === "warning") ? "destructive" : "secondary"}>
              {isLoading ? "Đang tải" : `${actionItems.length} mục`}
            </Badge>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="dashboard-action-skeleton" aria-label="Đang tải việc cần xử lý">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ) : (
              <div className="dashboard-action-list">
                {actionItems.map((item) => (
                  <ActionItemView item={item} key={item.title} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="dashboard-metric-strip" aria-label="Chỉ số vận hành">
        <MetricCell
          icon={<FileSpreadsheet />}
          label="Nhập dữ liệu"
          value={isLoading ? null : `${importAudits} sự kiện`}
          hint="Nhật ký hiện tại"
        />
        <MetricCell
          icon={<Activity />}
          label="Lần tối ưu"
          value={isLoading ? null : `${solverRuns} lần chạy`}
          hint="Theo dữ liệu API"
        />
        <MetricCell
          icon={<ListChecks />}
          label="Hàng đợi hoàn tất"
          value={isLoading ? null : `${queueCompleted} tác vụ`}
          hint={`${queueFailed} tác vụ lỗi`}
        />
        <MetricCell
          icon={<RefreshCw />}
          label="Cập nhật lần cuối"
          value={isLoading ? null : snapshot ? new Date(snapshot.fetchedAt).toLocaleTimeString("vi-VN") : "Chưa có"}
          hint={isRefreshing ? "Đang đồng bộ" : "Đồng bộ tự động"}
        />
      </section>

      <section className="dashboard-detail-grid" aria-label="Sức khỏe hệ thống và nhật ký">
        <Card className="dashboard-panel dashboard-health-panel">
          <CardHeader className="dashboard-panel-header">
            <div>
              <CardDescription>Trạng thái nền tảng</CardDescription>
              <CardTitle>Sức khỏe hệ thống</CardTitle>
            </div>
            <Button
              aria-label="Làm mới sức khỏe hệ thống"
              variant="ghost"
              size="icon"
              onClick={() => void dashboardQuery.refetch()}
              disabled={isRefreshing || !schoolId}
            >
              <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="dashboard-health-summary">
              <div>
                <span className="dashboard-health-label">Tổng quan</span>
                <strong>{isLoading ? "Đang tải" : readinessLabel(snapshot?.readiness.status)}</strong>
              </div>
              <Badge variant={snapshot?.readiness.status === "ready" ? "default" : "secondary"}>
                {isLoading ? "Đang tải" : snapshot?.readiness.status === "ready" ? "Sẵn sàng" : "Cần kiểm tra"}
              </Badge>
            </div>
            <div className="dashboard-health-grid">
              <HealthCell icon={<Database />} label="PostgreSQL" value={snapshot?.readiness.dependencies?.postgres} />
              <HealthCell icon={<Server />} label="Redis" value={snapshot?.readiness.dependencies?.redis} />
              <HealthCell icon={<ShieldCheck />} label="Vai trò" value={frontendConfig.actorRole} />
              <HealthCell
                icon={<Layers3 />}
                label="Phiên bản"
                value={frontendConfig.scheduleVersionId || "Chưa cấu hình"}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard-panel dashboard-audit-panel">
          <CardHeader>
            <CardDescription>Hoạt động gần đây</CardDescription>
            <CardTitle>Nhật ký theo phạm vi</CardTitle>
            <Input
              aria-label="Tìm nhật ký"
              value={auditQuery}
              onChange={(event) => setAuditQuery(event.target.value)}
              placeholder="Tìm hành động hoặc người thực hiện…"
            />
          </CardHeader>
          <CardContent>
            {filteredAuditLogs.length === 0 ? (
              <div className="dashboard-empty-state">
                <CheckCircle2 aria-hidden="true" />
                <strong>Chưa có nhật ký phù hợp</strong>
                <span>Nhật ký mới sẽ xuất hiện khi có thao tác trong phạm vi này.</span>
              </div>
            ) : (
              <div className="dashboard-audit-list">
                {filteredAuditLogs.slice(0, 8).map((entry) => (
                  <div className="dashboard-audit-row" key={entry.id}>
                    <span className="dashboard-audit-icon" aria-hidden="true">
                      <Activity />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{auditActionLabel(entry.action)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.entityType.toLowerCase()} - {entry.actorId}
                      </p>
                    </div>
                    <time className="dashboard-audit-time" dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString("vi-VN")}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function buildActionItems({
  canImport,
  hasError,
  hasSchool,
  queueFailed,
  refetch,
}: {
  canImport: boolean;
  hasError: boolean;
  hasSchool: boolean;
  queueFailed: number;
  refetch: () => void;
}): DashboardAction[] {
  if (!hasSchool) {
    return [
      {
        icon: AlertTriangle,
        title: "Chọn trường để bắt đầu",
        description: "Chọn một trường trong header để đọc dữ liệu vận hành.",
        tone: "warning",
      },
    ];
  }
  if (hasError) {
    return [
      {
        icon: AlertTriangle,
        title: "Không đọc được dữ liệu vận hành",
        description: "Kiểm tra kết nối API rồi thử tải lại dashboard.",
        tone: "warning",
        action: { label: "Thử lại", onClick: refetch },
      },
    ];
  }
  if (queueFailed > 0) {
    return [
      {
        icon: AlertTriangle,
        title: `${queueFailed} tác vụ tối ưu cần kiểm tra`,
        description: "Mở thời khóa biểu để xem trạng thái tác vụ và lý do lỗi.",
        tone: "warning",
        action: { label: "Mở thời khóa biểu", onClick: () => navigateTo("timetable") },
      },
    ];
  }
  return [
    {
      icon: CheckCircle2,
      title: "Chưa có việc cần xử lý",
      description: canImport ? "Dữ liệu và hàng đợi đang ở trạng thái ổn định." : "Bạn đang ở chế độ chỉ xem.",
      tone: "success",
    },
  ];
}

function ScopeItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="dashboard-scope-item">
      <span className="dashboard-scope-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
      </span>
    </div>
  );
}

function ActionItemView({ item }: { item: DashboardAction }) {
  const Icon = item.icon;
  return (
    <div className={`dashboard-action-item is-${item.tone}`}>
      <span className="dashboard-action-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="dashboard-action-copy">
        <strong>{item.title}</strong>
        <span>{item.description}</span>
      </div>
      {item.action ? (
        <Button size="sm" variant="outline" onClick={item.action.onClick} disabled={item.action.disabled}>
          {item.action.label}
        </Button>
      ) : null}
    </div>
  );
}

function MetricCell({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  hint: string;
}) {
  return (
    <article className="dashboard-metric-cell">
      <div className="dashboard-metric-label">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <strong>{value ?? <Skeleton className="h-7 w-24" />}</strong>
      <small>{hint}</small>
    </article>
  );
}

function HealthCell({ icon, label, value }: { icon: ReactNode; label: string; value: string | undefined }) {
  const normalizedValue = value?.toLowerCase() ?? "";
  const isHealthy = /ok|ready|up|healthy|connected|online/.test(normalizedValue);
  const isUnknown = !value;
  return (
    <div className="dashboard-health-cell">
      <div className="dashboard-health-cell-label">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <Badge variant={isUnknown ? "secondary" : isHealthy ? "default" : "destructive"}>{value ?? "Chưa có"}</Badge>
    </div>
  );
}

function readinessLabel(status: string | undefined) {
  if (status === "ready") return "Hệ thống đã sẵn sàng";
  if (status) return "Hệ thống cần được kiểm tra";
  return "Chưa có dữ liệu trạng thái";
}
