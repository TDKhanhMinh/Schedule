import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeacherAssignmentPreflightReport, TeacherAssignmentSolveResult } from "@schedule/backend/contracts";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";
import type { SchoolClass, Subject } from "./master-data-types";

interface TeacherAssignmentDemandRow {
  id: string;
  classId: string;
  classCode: string;
  className: string;
  grade: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  requiredSessions: number;
  status: "ACTIVE" | "ARCHIVED";
  currentTeacherId: string | null;
  currentTeacherCode: string | null;
  currentTeacherName: string | null;
  currentAssignmentSource: "MANUAL" | "AUTO" | null;
  currentAssignmentLocked: boolean;
  revision: number;
}

interface TeacherAssignmentRunStatus {
  id: string;
  jobId: string;
  status: string;
  result: TeacherAssignmentSolveResult | null;
  lastError: { code: string; message: string } | null;
  attempts: number;
  maxAttempts: number;
  progress: { stage: string; percent: number | null; heartbeatAt: string | null; isStalled: boolean };
  proposals: TeacherAssignmentSolveResult["proposals"];
  unassignedCount: number;
  canConfirm: boolean;
  canCancel: boolean;
  canRetry: boolean;
}

const runStateLabels: Record<string, string> = {
  QUEUED: "Đang xếp hàng",
  RUNNING: "Đang phân công",
  OPTIMAL: "Đã có phương án",
  FEASIBLE: "Có phương án khả thi",
  PARTIAL: "Phân công một phần",
  INFEASIBLE: "Không khả thi",
  UNKNOWN: "Chưa xác định",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
};

type TimeLimitOption = "60" | "120" | "300" | "unlimited";

export function TeacherAssignmentDialog({
  periodId,
  classes,
  subjects,
  canWrite,
  open,
  onOpenChange,
  onSaved,
}: {
  periodId: string;
  classes: SchoolClass[];
  subjects: Subject[];
  canWrite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [requiredSessions, setRequiredSessions] = useState("4");
  const [timeLimitOption, setTimeLimitOption] = useState<TimeLimitOption>("120");
  const [runId, setRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [preflight, setPreflight] = useState<TeacherAssignmentPreflightReport | null>(null);

  const activeClasses = classes.filter((item) => item.status === "ACTIVE");
  const activeSubjects = subjects.filter((item) => item.status === "ACTIVE");
  const demandsQuery = useQuery({
    queryKey: ["teacher-assignment-demands", frontendConfig.schoolId, periodId],
    queryFn: ({ signal }) =>
      apiRequest<TeacherAssignmentDemandRow[]>(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-assignment-runs/demands`,
        { signal },
      ),
    enabled: open && Boolean(frontendConfig.schoolId && periodId),
  });
  const statusQuery = useQuery({
    queryKey: ["teacher-assignment-run", frontendConfig.schoolId, periodId, runId],
    queryFn: ({ signal }) =>
      apiRequest<TeacherAssignmentRunStatus>(
        `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-assignment-runs/${runId}`,
        { signal },
      ),
    enabled: open && Boolean(runId),
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return state === "QUEUED" || state === "RUNNING" ? 2_000 : false;
    },
  });

  useEffect(() => {
    if (!open) return;
    setClassId(activeClasses[0]?.id ?? "");
    setSubjectId(activeSubjects[0]?.id ?? "");
    setRequiredSessions("4");
    setTimeLimitOption("120");
    setRunId(null);
    setNotice("");
    setPreflight(null);
  }, [open]);

  const basePath = `/schools/${frontendConfig.schoolId}/academic-periods/${periodId}/teacher-assignment-runs`;
  const preflightMutation = useMutation({
    mutationFn: () => apiRequest<TeacherAssignmentPreflightReport>(`${basePath}/preflight`, { method: "POST" }),
    onSuccess: (report) => {
      setPreflight(report);
      setNotice(
        report.canRun ? "Dữ liệu đủ điều kiện để tạo phương án." : "Dữ liệu chưa đủ điều kiện để phân công tự động.",
      );
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Không thể kiểm tra dữ liệu phân công."),
  });
  const demandMutation = useMutation({
    mutationFn: () =>
      apiRequest(`${basePath}/demands`, {
        method: "POST",
        body: JSON.stringify({ classId, subjectId, requiredSessions: Number(requiredSessions) }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teacher-assignment-demands", frontendConfig.schoolId, periodId],
      });
      setNotice("Đã thêm nhu cầu lớp-môn. Hãy kiểm tra và tạo phương án.");
      setPreflight(null);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Không thể thêm nhu cầu lớp-môn."),
  });
  const runMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ runId: string }>(basePath, {
        method: "POST",
        body: JSON.stringify({
          options: { timeLimitSeconds: timeLimitOption === "unlimited" ? null : Number(timeLimitOption) },
        }),
      }),
    onSuccess: (payload) => {
      setRunId(payload.runId);
      setNotice("Đã tạo phương án. Hệ thống đang phân công giáo viên và sẽ cập nhật kết quả.");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Không thể bắt đầu phân công tự động."),
  });
  const decisionMutation = useMutation({
    mutationFn: ({ action }: { action: "confirm" | "reject" | "cancel" }) =>
      apiRequest<TeacherAssignmentRunStatus>(`${basePath}/${runId}/${action}`, {
        method: "POST",
        headers: action === "confirm" ? { "Idempotency-Key": `teacher-assignment-confirm:${runId}` } : {},
        body:
          action === "reject" || action === "cancel" ? JSON.stringify({ reason: "Yêu cầu từ giao diện" }) : undefined,
      }),
    onSuccess: async (payload, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["teacher-assignment-run", frontendConfig.schoolId, periodId, runId],
      });
      if (variables.action === "confirm") {
        await queryClient.invalidateQueries({ queryKey: ["master-data", "period", frontendConfig.schoolId, periodId] });
        await queryClient.invalidateQueries({ queryKey: ["teacher-load-summary", frontendConfig.schoolId, periodId] });
        onSaved("Đã xác nhận phân công tự động; có thể tiếp tục xếp thời khóa biểu.");
        onOpenChange(false);
      } else {
        setNotice(variables.action === "cancel" ? "Đã hủy lần chạy phân công." : "Đã từ chối phương án phân công.");
      }
      void payload;
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Không thể cập nhật phương án phân công."),
  });

  const rows = demandsQuery.data ?? [];
  const result = statusQuery.data?.result;
  const proposals = statusQuery.data?.proposals ?? result?.proposals ?? [];
  const proposalByDemand = useMemo(
    () => new Map(proposals.map((proposal) => [proposal.demandId, proposal])),
    [proposals],
  );
  const status = statusQuery.data?.status;
  const canCreateRun = Boolean(preflight?.canRun) && !runMutation.isPending && !runId;

  function formatTimeLimit() {
    if (timeLimitOption === "unlimited") return "Không giới hạn";
    return `${timeLimitOption} giây`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="teacher-assignment-auto-dialog">
        <DialogHeader>
          <DialogTitle>
            <Sparkles aria-hidden="true" /> Tự động phân công giáo viên vào lớp
          </DialogTitle>
          <DialogDescription>
            Hệ thống đề xuất giáo viên theo môn-khối và tải dạy. Phân công thủ công đã khóa luôn được giữ nguyên.
          </DialogDescription>
        </DialogHeader>

        <div className="teacher-assignment-auto-content">
          <section className="teacher-assignment-auto-section">
            <div className="teacher-assignment-auto-section-heading">
              <div>
                <strong>Thêm nhu cầu lớp-môn</strong>
                <span>Chỉ cần nhập khi lớp/môn chưa có nhu cầu trong kỳ học.</span>
              </div>
              <Badge variant="secondary">{rows.length} nhu cầu</Badge>
            </div>
            <div className="teacher-assignment-demand-form">
              <label>
                <span>Lớp</span>
                <Select value={classId} onValueChange={setClassId} disabled={!activeClasses.length || Boolean(runId)}>
                  <SelectTrigger aria-label="Chọn lớp">
                    <SelectValue placeholder="Chọn lớp" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeClasses.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>Môn học</span>
                <Select
                  value={subjectId}
                  onValueChange={setSubjectId}
                  disabled={!activeSubjects.length || Boolean(runId)}
                >
                  <SelectTrigger aria-label="Chọn môn học">
                    <SelectValue placeholder="Chọn môn học" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSubjects.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                <span>Tiết/tuần</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={requiredSessions}
                  onChange={(event) => setRequiredSessions(event.target.value)}
                  disabled={Boolean(runId)}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !canWrite ||
                  !classId ||
                  !subjectId ||
                  Number(requiredSessions) < 1 ||
                  demandMutation.isPending ||
                  Boolean(runId)
                }
                onClick={() => void demandMutation.mutateAsync()}
              >
                {demandMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
                Thêm nhu cầu
              </Button>
            </div>
          </section>

          <section className="teacher-assignment-auto-section">
            <div className="teacher-assignment-auto-section-heading">
              <div>
                <strong>Kiểm tra và tạo phương án</strong>
                <span>Job tự động chỉ xử lý dữ liệu trong trường và kỳ học đang chọn.</span>
              </div>
            </div>
            <div className="teacher-assignment-run-controls">
              <label>
                <span>Thời gian chạy</span>
                <Select
                  value={timeLimitOption}
                  onValueChange={(value) => setTimeLimitOption(value as TimeLimitOption)}
                  disabled={Boolean(runId)}
                >
                  <SelectTrigger aria-label="Chọn thời gian chạy phân công">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">1 phút</SelectItem>
                    <SelectItem value="120">2 phút</SelectItem>
                    <SelectItem value="300">5 phút</SelectItem>
                    <SelectItem value="unlimited">Không giới hạn</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <span className="teacher-assignment-run-note">Phân công thủ công luôn được giữ nguyên.</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void preflightMutation.mutateAsync()}
                disabled={preflightMutation.isPending || Boolean(runId)}
              >
                {preflightMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
                Kiểm tra dữ liệu
              </Button>
              <Button
                type="button"
                onClick={() => void runMutation.mutateAsync()}
                disabled={!canWrite || !canCreateRun}
              >
                {runMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}
                Tạo phương án
              </Button>
            </div>
            <div className="teacher-assignment-auto-summary" aria-live="polite">
              <span className="teacher-assignment-summary-item is-demand">
                Nhu cầu <b>{preflight?.totalDemandCount ?? rows.length}</b>
              </span>
              <span className="teacher-assignment-summary-item is-locked">
                Đã khóa thủ công{" "}
                <b>{preflight?.lockedAssignmentCount ?? rows.filter((row) => row.currentAssignmentLocked).length}</b>
              </span>
              <span
                className={`teacher-assignment-summary-item is-candidate${preflight ? " is-checked" : " is-pending"}`}
              >
                Candidate <b>{preflight?.candidatePairCount ?? "Chưa kiểm tra"}</b>
              </span>
              <span className="teacher-assignment-summary-item is-limit">
                Giới hạn <b>{formatTimeLimit()}</b>
              </span>
            </div>
          </section>

          {preflight?.issues.length ? (
            <section className="teacher-assignment-feedback" role="status">
              {preflight.issues.slice(0, 6).map((issue) => (
                <p
                  key={`${issue.code}-${issue.demandId ?? "scope"}`}
                  className={issue.severity === "ERROR" ? "is-error" : "is-warning"}
                >
                  {issue.severity === "ERROR" ? <CircleAlert aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                  {issue.message}
                </p>
              ))}
            </section>
          ) : null}

          {notice ? (
            <p className="teacher-assignment-auto-notice" role="status">
              {notice}
            </p>
          ) : null}

          {status ? (
            <section className="teacher-assignment-auto-section">
              <div className="teacher-assignment-auto-section-heading">
                <div>
                  <strong>{runStateLabels[status] ?? status}</strong>
                  <span>Mã lần chạy: {runId}</span>
                </div>
                <Badge
                  variant={
                    status === "OPTIMAL" || status === "FEASIBLE"
                      ? "default"
                      : status === "PARTIAL"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {statusQuery.data?.unassignedCount ?? 0} chưa gán
                </Badge>
              </div>
              {status === "QUEUED" || status === "RUNNING" ? (
                <div className="teacher-assignment-running" role="status">
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  <span>
                    Đang xử lý. Nhịp hoạt động:{" "}
                    {statusQuery.data?.progress.heartbeatAt
                      ? new Date(statusQuery.data.progress.heartbeatAt).toLocaleString("vi-VN")
                      : "đang chờ"}
                    .
                  </span>
                </div>
              ) : null}
              {statusQuery.data?.lastError ? (
                <p className="teacher-assignment-feedback is-error" role="alert">
                  {statusQuery.data.lastError.message}
                </p>
              ) : null}
              {proposals.length ? (
                <div className="teacher-assignment-proposal-frame">
                  <table>
                    <thead>
                      <tr>
                        <th>Lớp</th>
                        <th>Môn</th>
                        <th>Giáo viên đề xuất</th>
                        <th>Tiết/tuần</th>
                        <th>Tải sau</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((demand) => {
                        const proposal = proposalByDemand.get(demand.id);
                        if (!proposal) return null;
                        return (
                          <tr key={demand.id}>
                            <td>
                              <strong>{demand.classCode}</strong>
                              <small>{demand.className}</small>
                            </td>
                            <td>
                              <strong>{demand.subjectCode}</strong>
                              <small>
                                {demand.subjectName} · Khối {demand.grade}
                              </small>
                            </td>
                            <td>{proposal.teacherId ?? "Chưa gán"}</td>
                            <td>{proposal.requiredSessions}</td>
                            <td>
                              {proposal.loadAfter ?? "-"} / {proposal.adjustedTarget ?? "-"}
                            </td>
                            <td>
                              <Badge
                                variant={
                                  proposal.status === "UNASSIGNED"
                                    ? "destructive"
                                    : proposal.source === "MANUAL"
                                      ? "secondary"
                                      : "default"
                                }
                              >
                                {proposal.status === "UNASSIGNED"
                                  ? "Chưa gán"
                                  : proposal.source === "MANUAL"
                                    ? "Giữ thủ công"
                                    : "Đề xuất"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {statusQuery.data?.canConfirm ? (
                <p className="teacher-assignment-confirm-ready">
                  <CheckCircle2 aria-hidden="true" /> Phương án đủ điều kiện để xác nhận.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          {runId && statusQuery.data?.canCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={decisionMutation.isPending}
              onClick={() => void decisionMutation.mutateAsync({ action: "cancel" })}
            >
              Hủy lần chạy
            </Button>
          ) : null}
          {runId && statusQuery.data?.canConfirm ? (
            <Button
              type="button"
              disabled={!canWrite || decisionMutation.isPending}
              onClick={() => void decisionMutation.mutateAsync({ action: "confirm" })}
            >
              Xác nhận phân công
            </Button>
          ) : null}
          <Button className="dialog-cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
