import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PreSolveReport, SolveJobResult } from "@schedule/backend/contracts";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkflowStepper, type WorkflowStepKey } from "@/components/workflow-stepper";
import { apiRequest } from "../../lib/api-client";
import type { TimetableSolveInput } from "./timetable-api";

type SolverTimeLimitOption = "60" | "120" | "300" | "unlimited";

const solverTimeLimitOptions: Array<{ value: SolverTimeLimitOption; label: string }> = [
  { value: "60", label: "1 phút" },
  { value: "120", label: "2 phút" },
  { value: "300", label: "5 phút" },
  { value: "unlimited", label: "Không giới hạn" },
];

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
  result: SolveJobResult | null;
  ruleSnapshot: {
    id: string;
    version: string | null;
    hash: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  } | null;
  appliedRuleCount: number;
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

export function OptimizationJobPanel({
  solveInput,
  onSolveCompleted,
}: {
  solveInput: TimetableSolveInput | null;
  onSolveCompleted: (result: SolveJobResult) => void;
}) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState(() => new URLSearchParams(window.location.search).get("jobId") ?? "");
  const [trackedJobId, setTrackedJobId] = useState(jobId);
  const [timeLimitOption, setTimeLimitOption] = useState<SolverTimeLimitOption>("120");
  const [notice, setNotice] = useState("");
  const [preflight, setPreflight] = useState<PreSolveReport | null>(null);
  const activeSolveJobRef = useRef<string | null>(null);
  const completedJobRef = useRef<string | null>(null);
  const pendingToastRef = useRef<string | number | null>(null);
  const statusQuery = useQuery({
    queryKey: ["optimization-job", trackedJobId],
    queryFn: ({ signal }) =>
      apiRequest<OptimizationJobStatus>(`/optimization-jobs/${encodeURIComponent(trackedJobId)}`, { signal }),
    enabled: Boolean(trackedJobId),
    refetchInterval: 2_000,
  });
  const solveMutation = useMutation({
    onMutate: () => {
      pendingToastRef.current = toast.loading("Đang kiểm tra dữ liệu để chuẩn bị xếp thời khóa biểu…");
    },
    mutationFn: async () => {
      if (!solveInput) throw new Error("Chưa đủ dữ liệu để kiểm tra và xếp thời khóa biểu.");
      const generatedJobId = createJobId();
      const payload = {
        ...solveInput,
        jobId: generatedJobId,
        options: {
          ...(solveInput.options ?? {}),
          timeLimitSeconds: timeLimitOption === "unlimited" ? null : Number(timeLimitOption),
        },
      };
      const report = await apiRequest<PreSolveReport>("/optimization-jobs/preflight", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setPreflight(report);
      if (!report.canSolve) {
        const firstError = report.issues.find((issue) => issue.severity === "ERROR");
        throw new Error(firstError?.message ?? "Kiểm tra trước khi tối ưu chưa đạt.");
      }
      return apiRequest<OptimizationJobStatus>("/optimization-jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (payload) => {
      completedJobRef.current = null;
      activeSolveJobRef.current = payload.jobId;
      setJobId(payload.jobId);
      setTrackedJobId(payload.jobId);
      setNotice("Đã gửi dữ liệu cho bộ tối ưu; đang theo dõi tiến trình.");
      toast.loading("Đang xếp thời khóa biểu; hệ thống sẽ thông báo khi hoàn tất.", {
        id: pendingToastRef.current ?? undefined,
      });
      window.history.replaceState(null, "", `${window.location.pathname}?jobId=${encodeURIComponent(payload.jobId)}`);
      void queryClient.invalidateQueries({ queryKey: ["optimization-job", payload.jobId] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Không thể bắt đầu tối ưu.";
      setNotice(message);
      toast.error(message, { id: pendingToastRef.current ?? undefined });
      pendingToastRef.current = null;
    },
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
  const solveComplete = status?.state === "OPTIMAL" || status?.state === "FEASIBLE";
  useEffect(() => {
    if (
      !status ||
      activeSolveJobRef.current !== status.jobId ||
      !solveComplete ||
      !status.result ||
      completedJobRef.current === status.jobId
    )
      return;
    completedJobRef.current = status.jobId;
    onSolveCompleted(status.result);
    const resultLabel = status.state === "OPTIMAL" ? "tối ưu" : "khả thi";
    const message = `Đã tìm được phương án ${resultLabel} với ${status.result.assignments.length} phân công.`;
    setNotice(`${message} Đang hiển thị phương án tạm thời để rà soát.`);
    toast.success(message, { id: pendingToastRef.current ?? undefined });
    pendingToastRef.current = null;
  }, [onSolveCompleted, solveComplete, status]);
  useEffect(() => {
    if (
      !status ||
      activeSolveJobRef.current !== status.jobId ||
      solveComplete ||
      completedJobRef.current === status.jobId
    )
      return;
    if (status.state === "INFEASIBLE") {
      completedJobRef.current = status.jobId;
      toast.error("Bộ tối ưu không tìm được phương án thỏa các ràng buộc.", {
        id: pendingToastRef.current ?? undefined,
      });
      pendingToastRef.current = null;
    } else if (status.state === "FAILED") {
      completedJobRef.current = status.jobId;
      toast.error("Tác vụ xếp thời khóa biểu thất bại; hãy kiểm tra chi tiết bên dưới.", {
        id: pendingToastRef.current ?? undefined,
      });
      pendingToastRef.current = null;
    } else if (status.state === "CANCELLED") {
      completedJobRef.current = status.jobId;
      toast.message("Tác vụ xếp thời khóa biểu đã được hủy.", { id: pendingToastRef.current ?? undefined });
      pendingToastRef.current = null;
    } else if (status.state === "UNKNOWN") {
      completedJobRef.current = status.jobId;
      toast.warning("Tác vụ xếp thời khóa biểu chưa xác định được kết quả.", {
        id: pendingToastRef.current ?? undefined,
      });
      pendingToastRef.current = null;
    }
  }, [solveComplete, status]);
  const completedWorkflowSteps: WorkflowStepKey[] = trackedJobId
    ? ["upload", "validate", "confirm", ...(solveComplete ? ["solve" as const] : [])]
    : [];
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
      <WorkflowStepper activeStep={solveComplete ? "review" : "solve"} completedSteps={completedWorkflowSteps} />
      <div className="optimization-job-controls flex flex-wrap lg:grid items-end gap-2.5">
        <Button
          className="min-h-[38px] sm:min-h-[36px]"
          type="button"
          onClick={() => void solveMutation.mutateAsync()}
          disabled={!solveInput || solveMutation.isPending || status?.state === "QUEUED" || status?.state === "RUNNING"}
        >
          {solveMutation.isPending
            ? "Đang kiểm tra…"
            : status?.state === "QUEUED" || status?.state === "RUNNING"
              ? "Đang xếp TKB…"
              : "Kiểm tra và xếp TKB"}
        </Button>
        <label className="optimization-time-limit-field">
          <span>Thời gian chạy cho lần xếp mới</span>
          <Select
            value={timeLimitOption}
            onValueChange={(value) => setTimeLimitOption(value as SolverTimeLimitOption)}
            disabled={
              !solveInput || solveMutation.isPending || status?.state === "QUEUED" || status?.state === "RUNNING"
            }
          >
            <SelectTrigger aria-label="Chọn thời gian chạy bộ tối ưu">
              <SelectValue placeholder="Chọn thời gian chạy" />
            </SelectTrigger>
            <SelectContent>
              {solverTimeLimitOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>Mã tác vụ tối ưu</span>
          <Input
            name="optimizationJobId"
            autoComplete="off"
            spellCheck={false}
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            placeholder="Nhập mã tác vụ"
          />
        </label>
        <Button type="button" onClick={track}>
          Theo dõi tác vụ
        </Button>
        <Button variant="outline" type="button" onClick={() => void statusQuery.refetch()} disabled={!trackedJobId}>
          Làm mới
        </Button>
      </div>
      {timeLimitOption === "unlimited" ? (
        <p className="optimization-job-warning">
          Không giới hạn: bộ tối ưu sẽ chạy đến khi có kết quả xác định hoặc chứng minh vô nghiệm. Bạn vẫn có thể hủy
          tác vụ.
        </p>
      ) : null}
      {notice || statusQuery.error ? (
        <p className="optimization-job-notice">
          {notice ||
            (statusQuery.error instanceof Error ? statusQuery.error.message : "Không thể đọc trạng thái tác vụ.")}
        </p>
      ) : null}
      {preflight && !preflight.canSolve ? (
        <div className="optimization-job-preflight-error" role="alert">
          <strong>Dữ liệu chưa đủ điều kiện để xếp thời khóa biểu.</strong>
          <ul>
            {preflight.issues
              .filter((issue) => issue.severity === "ERROR")
              .slice(0, 4)
              .map((issue) => (
                <li key={`${issue.code}-${issue.lessonId ?? issue.resourceId ?? "scope"}`}>{issue.message}</li>
              ))}
          </ul>
        </div>
      ) : null}
      {preflight ? <RuleImpactPreview report={preflight} /> : null}
      {status ? (
        <>
          <RuleApplicationSummary status={status} />
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
          {status.result ? <RuleDiagnostics result={status.result} ruleSnapshotId={status.ruleSnapshot?.id} /> : null}
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

function RuleImpactPreview({ report }: { report: PreSolveReport }) {
  const ruleIssueCount = report.issues.filter((issue) => issue.entity === "RULE").length;
  return (
    <section className="optimization-rule-summary" aria-labelledby="optimization-rule-impact-title">
      <div className="optimization-rule-summary-heading">
        <div>
          <span className="optimization-rule-kicker">Kiểm tra trước khi xếp</span>
          <h3 id="optimization-rule-impact-title">Ảnh hưởng của bộ quy tắc</h3>
        </div>
        <span className={report.canSolve ? "optimization-rule-state valid" : "optimization-rule-state invalid"}>
          {report.canSolve ? "Đủ điều kiện" : "Cần rà soát"}
        </span>
      </div>
      <div className="optimization-rule-facts">
        <span>
          Nhu cầu <b>{report.totalDemandSessions}</b> tiết
        </span>
        <span>
          Sức chứa <b>{report.slotCapacity}</b> slot
        </span>
        <span>
          Rule cần kiểm tra <b>{ruleIssueCount}</b>
        </span>
        <span>
          Conflict <b>{report.issues.length}</b>
        </span>
      </div>
    </section>
  );
}

function RuleApplicationSummary({ status }: { status: OptimizationJobStatus }) {
  return (
    <section className="optimization-rule-summary" aria-labelledby="optimization-rule-application-title">
      <div className="optimization-rule-summary-heading">
        <div>
          <span className="optimization-rule-kicker">Nguồn ràng buộc</span>
          <h3 id="optimization-rule-application-title">Bộ quy tắc đã áp dụng</h3>
        </div>
        <span className={status.ruleSnapshot ? "optimization-rule-state valid" : "optimization-rule-state invalid"}>
          {status.ruleSnapshot ? "Đã xác định" : "Chưa xác định"}
        </span>
      </div>
      {status.ruleSnapshot ? (
        <div className="optimization-rule-provenance">
          <span>
            Phiên bản <b>{status.ruleSnapshot.version ?? "Chưa có"}</b>
          </span>
          <span>
            Rule đã áp dụng <b>{status.appliedRuleCount}</b>
          </span>
          <span>
            Mã snapshot <code>{status.ruleSnapshot.id}</code>
          </span>
          <span>
            Mã băm <code>{status.ruleSnapshot.hash?.slice(0, 16) ?? "Chưa có"}</code>
          </span>
          <span>
            Người duyệt <b>{status.ruleSnapshot.approvedBy ?? "Chưa có"}</b>
          </span>
          <span>
            Hiệu lực <b>{formatEffectiveRange(status.ruleSnapshot.effectiveFrom, status.ruleSnapshot.effectiveTo)}</b>
          </span>
        </div>
      ) : (
        <p className="optimization-job-warning">
          Chưa có snapshot rule hợp lệ. Không nên dùng kết quả này cho phát hành.
        </p>
      )}
    </section>
  );
}

function RuleDiagnostics({ result, ruleSnapshotId }: { result: SolveJobResult; ruleSnapshotId?: string }) {
  const violations = (result.diagnostics.conflictDetails ?? []).filter(
    (detail) => detail.severity === "WARNING" && detail.code === "PREFERENCE_VIOLATED",
  );
  const breakdown = result.diagnostics.objectiveBreakdown;
  return (
    <section className="optimization-rule-summary" aria-labelledby="optimization-rule-diagnostics-title">
      <div className="optimization-rule-summary-heading">
        <div>
          <span className="optimization-rule-kicker">Sau khi xếp</span>
          <h3 id="optimization-rule-diagnostics-title">Kết quả áp dụng rule</h3>
        </div>
        <span className={violations.length ? "optimization-rule-state invalid" : "optimization-rule-state valid"}>
          {violations.length ? `${violations.length} ưu tiên bị vi phạm` : "Không có vi phạm mềm"}
        </span>
      </div>
      {breakdown ? (
        <div className="optimization-rule-facts">
          <span>
            Ngày nghỉ mong muốn <b>{breakdown.preferredDays}</b>
          </span>
          <span>
            Liên tục <b>{breakdown.compactness}</b>
          </span>
          <span>
            Tổng điểm phạt <b>{breakdown.weightedTotal}</b>
          </span>
        </div>
      ) : null}
      {ruleSnapshotId ? (
        <small className="optimization-rule-reference">Snapshot tham chiếu: {ruleSnapshotId}</small>
      ) : null}
      {violations.length ? (
        <ul className="optimization-rule-violations">
          {violations.slice(0, 6).map((detail, index) => (
            <li key={`${detail.code}-${detail.entityReferences.teacherId ?? "teacher"}-${index}`}>
              <strong>{detail.code}</strong>
              <span>{detail.message}</span>
              <small>{detail.remediationHint}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatEffectiveRange(from: string | null, to: string | null) {
  if (!from) return "Chưa có";
  return to ? `${from} → ${to}` : `Từ ${from}`;
}

function createJobId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `timetable-${Date.now()}-${suffix.slice(0, 8)}`;
}
