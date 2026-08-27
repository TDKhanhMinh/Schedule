import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "../../lib/api-client";

interface OptimizationJobStatus {
  jobId: string;
  state: string;
  statusContractVersion: string;
  attempts: number;
  maxAttempts: number;
  failedReason: string | null;
  cancelRequested: boolean;
  canCancel: boolean;
  canRetry: boolean;
  progress: { stage: string; percent?: number; heartbeatAt: string | null; isStalled: boolean };
}
const stateLabels: Record<string, string> = {
  QUEUED: "Đang xếp hàng",
  RUNNING: "Đang chạy",
  OPTIMAL: "Tối ưu",
  FEASIBLE: "Khả thi",
  INFEASIBLE: "Vô nghiệm",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  UNKNOWN: "Chưa xác định",
};

export function OptimizationJobPanel() {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState(() => new URLSearchParams(window.location.search).get("jobId") ?? "");
  const [trackedJobId, setTrackedJobId] = useState(jobId);
  const [notice, setNotice] = useState("");
  const statusQuery = useQuery({
    queryKey: ["optimization-job", trackedJobId],
    queryFn: ({ signal }) =>
      apiRequest<OptimizationJobStatus>(`/optimization-jobs/${encodeURIComponent(trackedJobId)}`, { signal }),
    enabled: Boolean(trackedJobId),
    refetchInterval: 2_000,
  });
  const jobMutation = useMutation({
    mutationFn: async ({ action, status }: { action: "cancel" | "retry"; status: OptimizationJobStatus }) =>
      apiRequest<OptimizationJobStatus>(`/optimization-jobs/${encodeURIComponent(status.jobId)}/${action}`, {
        method: "POST",
        headers: action === "retry" ? { "Idempotency-Key": `optimization-retry:${status.jobId}` } : {},
        body: action === "cancel" ? JSON.stringify({ reason: "Yêu cầu từ giao diện" }) : undefined,
      }),
    onSuccess: async (payload, variables) => {
      const nextJobId = payload.jobId ?? variables.status.jobId;
      setJobId(nextJobId);
      setTrackedJobId(nextJobId);
      setNotice(variables.action === "cancel" ? "Đã ghi nhận yêu cầu hủy." : "Đã tạo tác vụ thử lại.");
      await queryClient.invalidateQueries({ queryKey: ["optimization-job", nextJobId] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Không thể thực hiện thao tác."),
  });
  const status = statusQuery.data;
  function track() {
    const next = jobId.trim();
    if (!next) return setNotice("Nhập mã tác vụ để theo dõi trạng thái.");
    setTrackedJobId(next);
    window.history.replaceState(null, "", `${window.location.pathname}?jobId=${encodeURIComponent(next)}`);
  }
  return (
    <section className="optimization-job-panel" aria-labelledby="optimization-job-title">
      <div className="optimization-job-heading">
        <div>
          <p className="eyebrow">Điều khiển tác vụ bền vững</p>
          <h2 id="optimization-job-title">Theo dõi và điều khiển tác vụ</h2>
          <p className="small-note">PostgreSQL là nguồn trạng thái; giao diện chỉ gọi API.</p>
        </div>
        {status ? <span className="solve-status">{stateLabels[status.state] ?? status.state}</span> : null}
      </div>
      <div className="optimization-job-controls">
        <label>
          <span>Mã tác vụ tối ưu</span>
          <Input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Nhập mã tác vụ" />
        </label>
        <Button type="button" onClick={track}>
          Theo dõi tác vụ
        </Button>
        <Button variant="outline" type="button" onClick={() => void statusQuery.refetch()} disabled={!trackedJobId}>
          Làm mới
        </Button>
      </div>
      {notice || statusQuery.error ? (
        <p className="optimization-job-notice">
          {notice ||
            (statusQuery.error instanceof Error ? statusQuery.error.message : "Không thể đọc trạng thái tác vụ.")}
        </p>
      ) : null}
      {status ? (
        <>
          <div className="optimization-job-metrics">
            <span>
              Giai đoạn <b>{status.progress.stage}</b>
            </span>
            <span>
              Lần thử{" "}
              <b>
                {status.attempts}/{status.maxAttempts}
              </b>
            </span>
            <span>
              Nhịp hoạt động{" "}
              <b>
                {status.progress.heartbeatAt
                  ? new Date(status.progress.heartbeatAt).toLocaleString("vi-VN")
                  : "Chưa có"}
              </b>
            </span>
            <span>
              Hợp đồng <b>{status.statusContractVersion}</b>
            </span>
          </div>
          <progress
            className="optimization-job-progress"
            max={100}
            value={status.progress.percent ?? undefined}
            aria-label={`Tiến độ ${status.progress.stage}`}
          />
          {status.progress.isStalled ? (
            <p className="optimization-job-warning">Tác vụ bị treo; cần kiểm tra worker và nhật ký thực thi.</p>
          ) : null}
          {status.failedReason ? <p className="optimization-job-error">{status.failedReason}</p> : null}
          <div className="optimization-job-actions">
            <Button
              type="button"
              onClick={() => void jobMutation.mutateAsync({ action: "cancel", status })}
              disabled={jobMutation.isPending || !status.canCancel}
            >
              Hủy tối ưu
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => void jobMutation.mutateAsync({ action: "retry", status })}
              disabled={jobMutation.isPending || !status.canRetry}
            >
              Thử lại tác vụ
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
