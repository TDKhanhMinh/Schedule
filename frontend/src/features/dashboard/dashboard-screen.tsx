import { useQuery } from "@tanstack/react-query";
import { Activity, Database, FileSpreadsheet, ListChecks, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../../app/app-shell";
import { frontendConfig } from "../../config";
import { apiRequest, apiText } from "../../lib/api-client";
import { navigateTo } from "../../routing";
import { useWorkspace } from "../../app/workspace-provider";

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
  const { context, schoolId } = useWorkspace();
  const [auditQuery, setAuditQuery] = useState("");
  const canImport = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "SCHEDULER";
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", frontendConfig.schoolId],
    queryFn: ({ signal }) => fetchDashboard(signal),
    enabled: Boolean(frontendConfig.schoolId),
  });
  const snapshot = dashboardQuery.data;
  const error = !frontendConfig.schoolId
    ? "Chưa cấu hình mã trường. Hãy chọn trường trong header hoặc đặt VITE_SCHOOL_ID."
    : dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : "";
  const isLoading = dashboardQuery.isPending && Boolean(frontendConfig.schoolId);
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tổng quan không gian làm việc"
        title="Bảng điều khiển quản trị trường và vận hành"
        description="Theo dõi dữ liệu, tác vụ và phiên bản theo trường và năm học đã chọn."
        action={
          <Button onClick={() => navigateTo("imports")} disabled={!canImport}>
            <FileSpreadsheet /> Nhập dữ liệu
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <Server />
          <AlertTitle>Chưa thể tải toàn bộ dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section
        className="grid gap-4 xl:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"
        aria-label="Tổng quan không gian làm việc"
      >
        <Card className="border-primary/20 bg-primary/[0.04] xl:row-span-2">
          <CardHeader>
            <Badge className="w-fit">Phạm vi trường</Badge>
            <CardTitle className="text-2xl">
              {(context?.schools.find((school) => school.id === schoolId)?.name ?? schoolId) || "Chưa cấu hình"}
            </CardTitle>
            <CardDescription>Dữ liệu được đọc từ API theo trường và năm học đã chọn.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => navigateTo("imports")} disabled={!canImport}>
              <FileSpreadsheet /> Tải lên và xem trước
            </Button>
            <Button variant="outline" onClick={() => navigateTo("master-data")}>
              Dữ liệu danh mục
            </Button>
          </CardContent>
        </Card>
        <MetricCard
          icon={<FileSpreadsheet />}
          label="Nhập dữ liệu / nhật ký"
          value={isLoading ? null : `${importAudits} sự kiện`}
          hint="Trong cửa sổ hiện tại"
        />
        <MetricCard
          icon={<Activity />}
          label="Lần tối ưu gần nhất"
          value={isLoading ? null : `${solverRuns} lần chạy`}
          hint="Theo dữ liệu vận hành"
        />
        <MetricCard
          icon={<ListChecks />}
          label="Sức khỏe hàng đợi"
          value={isLoading ? null : `${queueCompleted} hoàn tất`}
          hint={`${queueFailed} lỗi`}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Vận hành và nhật ký gần đây">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardDescription>Vận hành</CardDescription>
              <CardTitle>Sức khỏe và độ mới dữ liệu</CardTitle>
            </div>
            <Badge variant={snapshot?.readiness.status === "ready" ? "default" : "secondary"}>
              {isLoading ? "Đang tải…" : snapshot?.readiness.status === "ready" ? "Sẵn sàng" : "Chưa kiểm tra"}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <StatusCell
              icon={<Database />}
              label="PostgreSQL"
              value={snapshot?.readiness.dependencies?.postgres ?? "Chưa có"}
            />
            <StatusCell icon={<Server />} label="Redis" value={snapshot?.readiness.dependencies?.redis ?? "Chưa có"} />
            <StatusCell icon={<ShieldCheck />} label="Vai trò" value={frontendConfig.actorRole} />
            <StatusCell
              icon={<RefreshCw />}
              label="Cập nhật lúc"
              value={snapshot ? new Date(snapshot.fetchedAt).toLocaleTimeString("vi-VN") : "Chưa có"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Nhật ký theo phạm vi</CardDescription>
            <CardTitle>Nhật ký gần đây</CardTitle>
            <Input
              aria-label="Tìm nhật ký"
              value={auditQuery}
              onChange={(event) => setAuditQuery(event.target.value)}
              placeholder="Tìm hành động hoặc người thực hiện…"
            />
          </CardHeader>
          <CardContent>
            {filteredAuditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có nhật ký phù hợp.</p>
            ) : (
              <div className="divide-y">
                {filteredAuditLogs.slice(0, 8).map((entry) => (
                  <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={entry.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{auditActionLabel(entry.action)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.entityType.toLowerCase()} · {entry.actorId}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>
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

function MetricCard({
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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value ? value : <Skeleton className="h-8 w-20" />}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
function StatusCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate font-semibold">{value}</p>
    </div>
  );
}
