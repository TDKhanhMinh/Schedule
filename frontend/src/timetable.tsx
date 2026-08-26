import { useEffect, useMemo, useState } from "react";
import {
  type ConflictChain,
  type LockedAssignments,
  type ObjectiveBreakdown,
  type RelaxationProposal,
  type ScheduleVersionCompareResult,
  type ScheduleVersionDiffEntry,
} from "@schedule/backend/contracts";
import { authHeaders, frontendConfig } from "./config";
import { navigateTo } from "./routing";

const LOCKED_ASSIGNMENTS_CONTRACT_VERSION = "LOCKED-ASSIGNMENTS-1.0.0" as const;

type TimetableView = "class" | "teacher" | "room";
type TimetableState = "loading" | "ready" | "empty" | "error";
type WorkflowStatus = "IN_REVIEW" | "APPROVED" | "LOCKED" | "PUBLISHED";

const JOB_STATE_LABELS: Record<string, string> = {
  QUEUED: "Đang xếp hàng",
  RUNNING: "Đang chạy",
  OPTIMAL: "Tối ưu",
  FEASIBLE: "Khả thi",
  INFEASIBLE: "Vô nghiệm",
  UNKNOWN: "Chưa xác định",
  INVALID: "Không hợp lệ",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
};

const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  IN_REVIEW: "Đang rà soát",
  APPROVED: "Đã phê duyệt",
  LOCKED: "Đã khóa",
  PUBLISHED: "Đã công bố",
};

const DIFF_OPERATION_LABELS: Record<string, string> = {
  ADD: "Thêm",
  REMOVE: "Xóa",
  MOVE: "Chuyển",
  CHANGE: "Thay đổi",
};

const MANUAL_HISTORY_LABELS: Record<string, string> = {
  MOVE: "Chuyển",
  LOCK: "Khóa",
  UNLOCK: "Mở khóa",
  UNDO: "Hoàn tác",
  CLONE: "Nhân bản",
  ROLLBACK: "Khôi phục",
  APPROVE: "Phê duyệt",
  PUBLISH: "Công bố",
  REPAIR_PREVIEW: "Xem trước sửa lỗi",
  REPAIR_CONFIRM: "Xác nhận sửa lỗi",
};

interface TimetableLesson {
  id: string;
  classId: string;
  classLabel: string;
  teacherId: string;
  teacherLabel: string;
  roomId: string;
  roomLabel: string;
  subjectLabel: string;
  slotId: string;
  status: "SCHEDULED" | "CONFLICT";
  conflictMessage?: string;
}

interface TimetableSlot {
  id: string;
  day: number;
  dayLabel: string;
  period: number;
  shiftLabel: string;
  timeLabel: string;
}

interface TimetableEntity {
  id: string;
  label: string;
  detail: string;
}

type ObjectiveKey = Exclude<keyof ObjectiveBreakdown, "weightedTotal">;
type FocusFilter = "all" | "conflict" | "penalty";
type MoveDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

interface ObjectiveGroup {
  key: ObjectiveKey;
  label: string;
  description: string;
}

interface MovePreview {
  lessonId: string;
  fromSlotId: string;
  targetSlotId: string;
  eligible: boolean;
  reason: string;
  softPenaltyDelta: number;
}

interface CommittedMove {
  lessonId: string;
  fromSlotId: string;
  targetSlotId: string;
}

type LockScope = "lesson" | "teacher" | "day";

interface TimetableLockRecord {
  id: string;
  scope: LockScope;
  scopeId: string;
  scopeLabel: string;
  lessonIds: string[];
}

interface LockUndoState {
  previousLocks: TimetableLockRecord[];
  message: string;
}

type ManualHistoryKind =
  | "MOVE"
  | "LOCK"
  | "UNLOCK"
  | "UNDO"
  | "CLONE"
  | "ROLLBACK"
  | "APPROVE"
  | "PUBLISH"
  | "REPAIR_PREVIEW"
  | "REPAIR_CONFIRM";

interface ManualHistoryEntry {
  id: string;
  kind: ManualHistoryKind;
  summary: string;
  detail: string;
  createdAt: string;
}

type OptimizationJobState =
  "QUEUED" | "RUNNING" | "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "INVALID" | "FAILED" | "CANCELLED";

interface OptimizationJobStatus {
  statusContractVersion: string;
  jobId: string;
  runId: string | null;
  state: OptimizationJobState | string;
  result: unknown;
  failedReason: string | null;
  inputChecksum: string | null;
  outputChecksum: string | null;
  attempts: number;
  maxAttempts: number;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelRequested: boolean;
  retryOfRunId: string | null;
  progress: {
    stage: string;
    percent: number | null;
    heartbeatAt: string | null;
    isStalled: boolean;
  };
  canCancel: boolean;
  canRetry: boolean;
}

function OptimizationJobPanel() {
  const initialJobId = (() => {
    if (typeof window === "undefined") return import.meta.env.VITE_DEMO_JOB_ID?.trim() ?? "";
    return new URLSearchParams(window.location.search).get("jobId") ?? import.meta.env.VITE_DEMO_JOB_ID?.trim() ?? "";
  })();
  const [jobIdInput, setJobIdInput] = useState(initialJobId);
  const [trackedJobId, setTrackedJobId] = useState(initialJobId);
  const [status, setStatus] = useState<OptimizationJobStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!trackedJobId) return undefined;
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(
          `${frontendConfig.apiBaseUrl}/optimization-jobs/${encodeURIComponent(trackedJobId)}`,
          {
            headers: authHeaders(),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          OptimizationJobStatus | { message?: string } | null;
        if (!response.ok)
          throw new Error(
            payload && "message" in payload ? payload.message : `Không đọc được tác vụ (HTTP ${response.status}).`,
          );
        if (!disposed) {
          setStatus(payload as OptimizationJobStatus);
          setNotice("");
        }
      } catch (error) {
        if (!disposed) setNotice(error instanceof Error ? error.message : "Không thể đọc trạng thái tác vụ.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refreshNonce, trackedJobId]);

  function trackJob() {
    const nextJobId = jobIdInput.trim();
    if (!nextJobId) {
      setNotice("Nhập mã tác vụ để theo dõi trạng thái bền vững.");
      return;
    }
    setStatus(null);
    setNotice("Đang tải trạng thái tác vụ...");
    setTrackedJobId(nextJobId);
    window.history.replaceState(null, "", `${window.location.pathname}?jobId=${encodeURIComponent(nextJobId)}`);
  }

  async function mutateJob(action: "cancel" | "retry") {
    if (!status) return;
    setBusy(true);
    setNotice(action === "cancel" ? "Đang gửi yêu cầu hủy..." : "Đang tạo tác vụ thử lại...");
    try {
      const headers: Record<string, string> = { ...authHeaders(), "Content-Type": "application/json" };
      if (action === "retry") headers["Idempotency-Key"] = `optimization-retry:${status.jobId}`;
      const response = await fetch(
        `${frontendConfig.apiBaseUrl}/optimization-jobs/${encodeURIComponent(status.jobId)}/${action}`,
        {
          method: "POST",
          headers,
          body: action === "cancel" ? JSON.stringify({ reason: "User requested from UI" }) : undefined,
        },
      );
      const payload = (await response.json().catch(() => null)) as OptimizationJobStatus & { message?: string };
      if (!response.ok) throw new Error(payload?.message ?? `Thao tác thất bại (HTTP ${response.status}).`);
      const nextJobId = payload.jobId ?? status.jobId;
      setJobIdInput(nextJobId);
      setTrackedJobId(nextJobId);
      setNotice(
        action === "cancel"
          ? "Đã ghi nhận yêu cầu hủy; worker sẽ dừng an toàn."
          : "Đã tạo tác vụ thử lại với khóa idempotency.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể thực hiện thao tác.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="optimization-job-panel" aria-labelledby="optimization-job-title">
      <div className="optimization-job-heading">
        <div>
          <p className="eyebrow">Điều khiển tác vụ bền vững</p>
          <h2 id="optimization-job-title">Theo dõi và điều khiển tác vụ</h2>
          <p className="small-note">
            PostgreSQL là nguồn trạng thái; UI chỉ gọi API và không quyết định tính đúng đắn.
          </p>
        </div>
        {status ? (
          <span className={`solve-status job-state-${status.state.toLowerCase()}`}>
            {JOB_STATE_LABELS[status.state] ?? status.state}
          </span>
        ) : null}
      </div>
      <div className="optimization-job-controls">
        <label>
          <span>Mã tác vụ tối ưu</span>
          <input
            value={jobIdInput}
            onChange={(event) => setJobIdInput(event.target.value)}
            placeholder="Nhập mã tác vụ"
          />
        </label>
        <button type="button" onClick={trackJob}>
          Theo dõi tác vụ
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => setRefreshNonce((current) => current + 1)}
          disabled={!trackedJobId}
        >
          Tải lại
        </button>
      </div>
      {notice ? <p className="optimization-job-notice">{notice}</p> : null}
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
              <b>{status.progress.heartbeatAt ? new Date(status.progress.heartbeatAt).toLocaleString("vi-VN") : "—"}</b>
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
            <p className="optimization-job-warning">
              Phát hiện tác vụ bị treo; cần kiểm tra tiến trình xử lý và nhật ký thực thi.
            </p>
          ) : null}
          {status.failedReason ? <p className="optimization-job-error">{status.failedReason}</p> : null}
          {status.cancelRequested ? (
            <p className="optimization-job-notice">
              {status.state === "CANCELLED"
                ? "Worker đã xác nhận hủy solve an toàn."
                : "Đã ghi nhận yêu cầu hủy; chờ worker xác nhận."}
            </p>
          ) : null}
          <div className="optimization-job-actions">
            <button type="button" onClick={() => void mutateJob("cancel")} disabled={busy || !status.canCancel}>
              Hủy tối ưu
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => void mutateJob("retry")}
              disabled={busy || !status.canRetry}
            >
              Thử lại tác vụ
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

const DAYS = [
  { day: 1, label: "Thứ 2" },
  { day: 2, label: "Thứ 3" },
  { day: 3, label: "Thứ 4" },
  { day: 4, label: "Thứ 5" },
  { day: 5, label: "Thứ 6" },
] as const;

const SLOTS: TimetableSlot[] = [
  { id: "mon-p1", day: 1, dayLabel: "Thứ 2", period: 1, shiftLabel: "Sáng", timeLabel: "07:00–07:45" },
  { id: "mon-p2", day: 1, dayLabel: "Thứ 2", period: 2, shiftLabel: "Sáng", timeLabel: "07:50–08:35" },
  { id: "mon-p3", day: 1, dayLabel: "Thứ 2", period: 3, shiftLabel: "Sáng", timeLabel: "08:45–09:30" },
  { id: "mon-p4", day: 1, dayLabel: "Thứ 2", period: 4, shiftLabel: "Sáng", timeLabel: "09:35–10:20" },
  { id: "mon-p5", day: 1, dayLabel: "Thứ 2", period: 5, shiftLabel: "Sáng", timeLabel: "10:30–11:15" },
  { id: "tue-p1", day: 2, dayLabel: "Thứ 3", period: 1, shiftLabel: "Sáng", timeLabel: "07:00–07:45" },
  { id: "tue-p2", day: 2, dayLabel: "Thứ 3", period: 2, shiftLabel: "Sáng", timeLabel: "07:50–08:35" },
  { id: "tue-p3", day: 2, dayLabel: "Thứ 3", period: 3, shiftLabel: "Sáng", timeLabel: "08:45–09:30" },
  { id: "tue-p4", day: 2, dayLabel: "Thứ 3", period: 4, shiftLabel: "Sáng", timeLabel: "09:35–10:20" },
  { id: "tue-p5", day: 2, dayLabel: "Thứ 3", period: 5, shiftLabel: "Sáng", timeLabel: "10:30–11:15" },
  { id: "wed-p1", day: 3, dayLabel: "Thứ 4", period: 1, shiftLabel: "Sáng", timeLabel: "07:00–07:45" },
  { id: "wed-p2", day: 3, dayLabel: "Thứ 4", period: 2, shiftLabel: "Sáng", timeLabel: "07:50–08:35" },
  { id: "wed-p3", day: 3, dayLabel: "Thứ 4", period: 3, shiftLabel: "Sáng", timeLabel: "08:45–09:30" },
  { id: "wed-p4", day: 3, dayLabel: "Thứ 4", period: 4, shiftLabel: "Sáng", timeLabel: "09:35–10:20" },
  { id: "wed-p5", day: 3, dayLabel: "Thứ 4", period: 5, shiftLabel: "Sáng", timeLabel: "10:30–11:15" },
  { id: "thu-p1", day: 4, dayLabel: "Thứ 5", period: 1, shiftLabel: "Sáng", timeLabel: "07:00–07:45" },
  { id: "thu-p2", day: 4, dayLabel: "Thứ 5", period: 2, shiftLabel: "Sáng", timeLabel: "07:50–08:35" },
  { id: "thu-p3", day: 4, dayLabel: "Thứ 5", period: 3, shiftLabel: "Sáng", timeLabel: "08:45–09:30" },
  { id: "thu-p4", day: 4, dayLabel: "Thứ 5", period: 4, shiftLabel: "Sáng", timeLabel: "09:35–10:20" },
  { id: "thu-p5", day: 4, dayLabel: "Thứ 5", period: 5, shiftLabel: "Sáng", timeLabel: "10:30–11:15" },
  { id: "fri-p1", day: 5, dayLabel: "Thứ 6", period: 1, shiftLabel: "Sáng", timeLabel: "07:00–07:45" },
  { id: "fri-p2", day: 5, dayLabel: "Thứ 6", period: 2, shiftLabel: "Sáng", timeLabel: "07:50–08:35" },
  { id: "fri-p3", day: 5, dayLabel: "Thứ 6", period: 3, shiftLabel: "Sáng", timeLabel: "08:45–09:30" },
  { id: "fri-p4", day: 5, dayLabel: "Thứ 6", period: 4, shiftLabel: "Sáng", timeLabel: "09:35–10:20" },
  { id: "fri-p5", day: 5, dayLabel: "Thứ 6", period: 5, shiftLabel: "Sáng", timeLabel: "10:30–11:15" },
];

// Dữ liệu mẫu phản ánh cấu trúc phân công dùng chung cho đến khi nối API đọc kết quả tối ưu.
const DEMO_LESSONS: TimetableLesson[] = [
  {
    id: "lesson-math-7a1",
    classId: "class-7a1",
    classLabel: "7A1",
    teacherId: "teacher-an",
    teacherLabel: "GV An",
    roomId: "room-a101",
    roomLabel: "A101",
    subjectLabel: "Toán",
    slotId: "mon-p1",
    status: "SCHEDULED",
  },
  {
    id: "lesson-literature-7a1",
    classId: "class-7a1",
    classLabel: "7A1",
    teacherId: "teacher-binh",
    teacherLabel: "GV Bình",
    roomId: "room-a102",
    roomLabel: "A102",
    subjectLabel: "Ngữ văn",
    slotId: "tue-p2",
    status: "SCHEDULED",
  },
  {
    id: "lesson-english-7a1",
    classId: "class-7a1",
    classLabel: "7A1",
    teacherId: "teacher-chi",
    teacherLabel: "GV Chi",
    roomId: "room-lab",
    roomLabel: "Lab 01",
    subjectLabel: "Tiếng Anh",
    slotId: "wed-p3",
    status: "SCHEDULED",
  },
  {
    id: "lesson-science-7a1",
    classId: "class-7a1",
    classLabel: "7A1",
    teacherId: "teacher-an",
    teacherLabel: "GV An",
    roomId: "room-lab",
    roomLabel: "Lab 01",
    subjectLabel: "Khoa học tự nhiên",
    slotId: "thu-p1",
    status: "SCHEDULED",
  },
  {
    id: "lesson-math-7a2",
    classId: "class-7a2",
    classLabel: "7A2",
    teacherId: "teacher-an",
    teacherLabel: "GV An",
    roomId: "room-a103",
    roomLabel: "A103",
    subjectLabel: "Toán",
    slotId: "mon-p2",
    status: "SCHEDULED",
  },
  {
    id: "lesson-history-7a2",
    classId: "class-7a2",
    classLabel: "7A2",
    teacherId: "teacher-binh",
    teacherLabel: "GV Bình",
    roomId: "room-a103",
    roomLabel: "A103",
    subjectLabel: "Lịch sử",
    slotId: "wed-p1",
    status: "SCHEDULED",
  },
  {
    id: "lesson-physics-7a2",
    classId: "class-7a2",
    classLabel: "7A2",
    teacherId: "teacher-chi",
    teacherLabel: "GV Chi",
    roomId: "room-lab",
    roomLabel: "Lab 01",
    subjectLabel: "Vật lý",
    slotId: "fri-p2",
    status: "SCHEDULED",
  },
  {
    id: "lesson-conflict-7a1",
    classId: "class-7a1",
    classLabel: "7A1",
    teacherId: "teacher-an",
    teacherLabel: "GV An",
    roomId: "room-a101",
    roomLabel: "A101",
    subjectLabel: "Sinh hoạt",
    slotId: "wed-p2",
    status: "CONFLICT",
    conflictMessage: "GV An đang có hai phân công cùng Thứ 4 · Tiết 2.",
  },
  {
    id: "lesson-conflict-7a2",
    classId: "class-7a2",
    classLabel: "7A2",
    teacherId: "teacher-an",
    teacherLabel: "GV An",
    roomId: "room-a102",
    roomLabel: "A102",
    subjectLabel: "Sinh hoạt",
    slotId: "wed-p2",
    status: "CONFLICT",
    conflictMessage: "GV An đang có hai phân công cùng Thứ 4 · Tiết 2.",
  },
];

const viewLabels: Record<TimetableView, string> = {
  class: "Theo lớp",
  teacher: "Theo giáo viên",
  room: "Theo phòng",
};

const viewKeys: Record<TimetableView, keyof Pick<TimetableLesson, "classId" | "teacherId" | "roomId">> = {
  class: "classId",
  teacher: "teacherId",
  room: "roomId",
};

const DEMO_OBJECTIVE: ObjectiveBreakdown = {
  teacherGap: 0,
  compactness: 0,
  dayDistribution: 2,
  undesirableSlots: 0,
  preferredDays: 0,
  fairness: 2,
  weightedTotal: 4000,
};

const OBJECTIVE_GROUPS: ObjectiveGroup[] = [
  { key: "teacherGap", label: "Khoảng trống GV", description: "teacherGap" },
  { key: "compactness", label: "Liền mạch lớp", description: "compactness" },
  { key: "dayDistribution", label: "Phân bố ngày", description: "dayDistribution" },
  { key: "undesirableSlots", label: "Khung tiết không mong muốn", description: "undesirableSlots" },
  { key: "preferredDays", label: "Ngày ưu tiên", description: "preferredDays" },
  { key: "fairness", label: "Cân bằng tải", description: "fairness" },
];

const DEMO_SLOT_PENALTIES: Record<string, number> = {
  "mon-p1": 0,
  "mon-p2": 0,
  "tue-p2": 1,
  "wed-p1": 1,
  "wed-p2": 0,
  "wed-p3": 2,
  "thu-p1": 1,
  "fri-p2": 2,
};

function getSlotPenalty(slotId: string) {
  return DEMO_SLOT_PENALTIES[slotId] ?? 0;
}

function getHeatLevel(penalty: number): 0 | 1 | 2 | 3 {
  if (penalty >= 3) return 3;
  if (penalty === 2) return 2;
  if (penalty === 1) return 1;
  return 0;
}

function lessonMatchesSearch(lesson: TimetableLesson, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  return [lesson.subjectLabel, lesson.classLabel, lesson.teacherLabel, lesson.roomLabel]
    .join(" ")
    .toLocaleLowerCase("vi")
    .includes(normalizedQuery);
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function createMovePreview(lessonId: string, targetSlotId: string, lessons: TimetableLesson[]): MovePreview | null {
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  const targetSlot = SLOTS.find((slot) => slot.id === targetSlotId);
  if (!lesson || !targetSlot) return null;

  const softPenaltyDelta = getSlotPenalty(targetSlotId) - getSlotPenalty(lesson.slotId);
  if (lesson.slotId === targetSlotId) {
    return {
      lessonId,
      fromSlotId: lesson.slotId,
      targetSlotId,
      eligible: true,
      reason: "Lesson đang ở slot này.",
      softPenaltyDelta: 0,
    };
  }

  const conflictingLesson = lessons.find(
    (candidate) =>
      candidate.id !== lesson.id &&
      candidate.slotId === targetSlotId &&
      (candidate.classId === lesson.classId ||
        candidate.teacherId === lesson.teacherId ||
        candidate.roomId === lesson.roomId),
  );
  if (conflictingLesson) {
    const resource =
      conflictingLesson.classId === lesson.classId
        ? `Lớp ${lesson.classLabel}`
        : conflictingLesson.teacherId === lesson.teacherId
          ? lesson.teacherLabel
          : `Phòng ${lesson.roomLabel}`;
    return {
      lessonId,
      fromSlotId: lesson.slotId,
      targetSlotId,
      eligible: false,
      reason: `Không hợp lệ: ${resource} đã có phân công tại ${targetSlot.dayLabel} · Tiết ${targetSlot.period}.`,
      softPenaltyDelta,
    };
  }

  return {
    lessonId,
    fromSlotId: lesson.slotId,
    targetSlotId,
    eligible: true,
    reason: `Đích hợp lệ: ${targetSlot.dayLabel} · ${targetSlot.shiftLabel} · Tiết ${targetSlot.period}.`,
    softPenaltyDelta,
  };
}

function moveTargetByKeyboard(lessonId: string, direction: MoveDirection, lessons: TimetableLesson[]) {
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  const sourceSlot = SLOTS.find((slot) => slot.id === lesson?.slotId);
  if (!lesson || !sourceSlot) return null;

  const dayDelta = direction === "ArrowLeft" ? -1 : direction === "ArrowRight" ? 1 : 0;
  const periodDelta = direction === "ArrowUp" ? -1 : direction === "ArrowDown" ? 1 : 0;
  const targetSlot = SLOTS.find(
    (slot) => slot.day === sourceSlot.day + dayDelta && slot.period === sourceSlot.period + periodDelta,
  );
  return targetSlot ? createMovePreview(lessonId, targetSlot.id, lessons) : null;
}

function createLockRecords(scope: LockScope, lessonIds: string[], lessons: TimetableLesson[]): TimetableLockRecord[] {
  const selectedLessons = lessons.filter((lesson) => lessonIds.includes(lesson.id));
  const groups = new Map<string, TimetableLesson[]>();
  selectedLessons.forEach((lesson) => {
    const slot = SLOTS.find((candidate) => candidate.id === lesson.slotId);
    const scopeId = scope === "lesson" ? lesson.id : scope === "teacher" ? lesson.teacherId : String(slot?.day ?? "");
    if (!scopeId) return;
    groups.set(scopeId, [...(groups.get(scopeId) ?? []), lesson]);
  });

  return [...groups.entries()].map(([scopeId, group]) => {
    const firstLesson = group[0];
    const slot = SLOTS.find((candidate) => candidate.id === firstLesson.slotId);
    const scopeLabel =
      scope === "lesson"
        ? `${firstLesson.subjectLabel} · ${firstLesson.classLabel}`
        : scope === "teacher"
          ? firstLesson.teacherLabel
          : (slot?.dayLabel ?? `Ngày ${scopeId}`);
    return {
      id: `${scope}:${scopeId}`,
      scope,
      scopeId,
      scopeLabel,
      lessonIds: group.map((lesson) => lesson.id),
    };
  });
}

function buildLockedAssignmentsContract(records: TimetableLockRecord[], lessons: TimetableLesson[]): LockedAssignments {
  const assignments = new Map<string, LockedAssignments["assignments"][number]>();
  records.forEach((record) => {
    record.lessonIds.forEach((lessonId) => {
      const lesson = lessons.find((candidate) => candidate.id === lessonId);
      if (!lesson) return;
      const sessionIndex = 0;
      assignments.set(`${lesson.id}:${sessionIndex}`, {
        lessonId: lesson.id,
        sessionIndex,
        slotId: lesson.slotId,
        roomId: lesson.roomId,
        scope: record.scope === "lesson" ? "LESSON" : record.scope === "teacher" ? "TEACHER" : "DAY",
        scopeId: record.scopeId,
      });
    });
  });
  return {
    contractVersion: LOCKED_ASSIGNMENTS_CONTRACT_VERSION,
    assignments: [...assignments.values()],
  };
}

function createLockedMovePreview(
  lessonId: string,
  targetSlotId: string,
  lessons: TimetableLesson[],
): MovePreview | null {
  const lesson = lessons.find((candidate) => candidate.id === lessonId);
  const targetSlot = SLOTS.find((slot) => slot.id === targetSlotId);
  if (!lesson || !targetSlot) return null;
  return {
    lessonId,
    fromSlotId: lesson.slotId,
    targetSlotId,
    eligible: false,
    reason: "Lesson đang khóa; hãy mở khóa trước khi đề xuất thay đổi.",
    softPenaltyDelta: getSlotPenalty(targetSlotId) - getSlotPenalty(lesson.slotId),
  };
}

function readInitialState(): TimetableState {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "loading" || state === "empty" || state === "error" ? state : "ready";
}

function buildLocalCompare(currentLessons: TimetableLesson[]): ScheduleVersionCompareResult {
  const baselineByKey = new Map(DEMO_LESSONS.map((lesson) => [`${lesson.id}:0`, lesson]));
  const currentByKey = new Map(currentLessons.map((lesson) => [`${lesson.id}:0`, lesson]));
  const keys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort();
  const toDiffAssignment = (lesson: TimetableLesson | undefined) => {
    if (!lesson) return null;
    const slot = SLOTS.find((candidate) => candidate.id === lesson.slotId);
    return {
      id: lesson.id,
      lessonId: lesson.id,
      sessionIndex: 0,
      timeSlotId: lesson.slotId,
      roomId: lesson.roomId,
      subjectLabel: lesson.subjectLabel,
      classLabel: lesson.classLabel,
      teacherLabel: lesson.teacherLabel,
      roomLabel: lesson.roomLabel,
      slotLabel: slot ? `${slot.dayLabel} · Tiết ${slot.period}` : lesson.slotId,
    };
  };
  const diffs: ScheduleVersionDiffEntry[] = keys.flatMap((key): ScheduleVersionDiffEntry[] => {
    const before = baselineByKey.get(key);
    const after = currentByKey.get(key);
    if (!before && after)
      return [
        {
          operation: "ADD" as const,
          lessonId: after.id,
          sessionIndex: 0,
          before: null,
          after: toDiffAssignment(after),
        },
      ];
    if (before && !after)
      return [
        {
          operation: "REMOVE" as const,
          lessonId: before.id,
          sessionIndex: 0,
          before: toDiffAssignment(before),
          after: null,
        },
      ];
    if (before && after && before.slotId !== after.slotId) {
      return [
        {
          operation: "MOVE" as const,
          lessonId: after.id,
          sessionIndex: 0,
          before: toDiffAssignment(before),
          after: toDiffAssignment(after),
        },
      ];
    }
    return [];
  });
  const scoreDelta = currentLessons.reduce(
    (total, lesson) =>
      total +
      getSlotPenalty(lesson.slotId) -
      getSlotPenalty(DEMO_LESSONS.find((base) => base.id === lesson.id)?.slotId ?? lesson.slotId),
    0,
  );
  return {
    contractVersion: "SCHEDULE-VERSION-OPS-1.0.0",
    fromVersion: { id: "demo-v1", versionNumber: 1, status: "PUBLISHED", revision: 1, etag: '"demo-v1:1"' },
    toVersion: { id: "demo-draft", versionNumber: 2, status: "DRAFT", revision: 1, etag: '"demo-draft:1"' },
    summary: {
      moves: diffs.filter((diff) => diff.operation === "MOVE").length,
      additions: diffs.filter((diff) => diff.operation === "ADD").length,
      removals: diffs.filter((diff) => diff.operation === "REMOVE").length,
      changedAssignments: diffs.length,
    },
    score: {
      from: DEMO_OBJECTIVE.weightedTotal,
      to: DEMO_OBJECTIVE.weightedTotal + scoreDelta * 100,
      delta: scoreDelta * 100,
      available: true,
      lowerIsBetter: true,
    },
    diffs,
  };
}

function getEntityOptions(view: TimetableView, lessons: TimetableLesson[]): TimetableEntity[] {
  const key = viewKeys[view];
  const entities = new Map<string, TimetableEntity>();
  lessons.forEach((lesson) => {
    const id = lesson[key];
    const label = view === "class" ? lesson.classLabel : view === "teacher" ? lesson.teacherLabel : lesson.roomLabel;
    const detail = view === "class" ? "Lớp học" : view === "teacher" ? "Người phụ trách" : "Không gian học";
    entities.set(id, { id, label, detail });
  });
  return [...entities.values()].sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

function formatViewSubject(lesson: TimetableLesson, view: TimetableView) {
  if (view === "class") return `${lesson.subjectLabel} · ${lesson.teacherLabel}`;
  if (view === "teacher") return `${lesson.subjectLabel} · ${lesson.classLabel}`;
  return `${lesson.subjectLabel} · ${lesson.classLabel}`;
}

function StatePanel({ state }: { state: TimetableState }) {
  if (state === "loading") {
    return (
      <div className="timetable-state" role="status" aria-live="polite">
        <div className="state-icon loading-icon" aria-hidden="true">
          …
        </div>
        <h3>Đang tải phương án</h3>
        <p>Đang đọc phân công và chẩn đoán từ tác vụ tối ưu. Vui lòng chờ trong giây lát.</p>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="timetable-state error-state" role="alert">
        <div className="state-icon error-icon" aria-hidden="true">
          !
        </div>
        <h3>Không thể tải thời khóa biểu</h3>
        <p>API chưa trả về phương án. Kiểm tra trạng thái tác vụ hoặc thử tải lại sau.</p>
        <button className="button-secondary" type="button" onClick={() => window.location.reload()}>
          Thử lại
        </button>
      </div>
    );
  }
  return (
    <div className="timetable-state" role="status">
      <div className="state-icon empty-icon" aria-hidden="true">
        ▦
      </div>
      <h3>Chưa có phân công để hiển thị</h3>
      <p>Hãy xác nhận dữ liệu và chạy bộ tối ưu trước khi mở các góc nhìn thời khóa biểu.</p>
      <button type="button" onClick={() => navigateTo("imports")}>
        Mở nhập dữ liệu →
      </button>
    </div>
  );
}

function TimetableGrid({
  view,
  selectedEntityId,
  lessons,
  heatmapEnabled,
  preview,
  draggedLessonId,
  lockedLessonIds,
  selectedLessonIds,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyboardMove,
  onToggleSelection,
}: {
  view: TimetableView;
  selectedEntityId: string;
  lessons: TimetableLesson[];
  heatmapEnabled: boolean;
  preview: MovePreview | null;
  draggedLessonId: string | null;
  lockedLessonIds: Set<string>;
  selectedLessonIds: Set<string>;
  onDragStart: (lessonId: string) => void;
  onDragEnd: () => void;
  onDragOver: (targetSlotId: string) => void;
  onDrop: (targetSlotId: string) => void;
  onKeyboardMove: (lessonId: string, direction: MoveDirection) => void;
  onToggleSelection: (lessonId: string) => void;
}) {
  const visibleLessons = lessons.filter((lesson) => lesson[viewKeys[view]] === selectedEntityId);
  const lessonBySlot = new Map<string, TimetableLesson[]>();
  visibleLessons.forEach((lesson) => {
    lessonBySlot.set(lesson.slotId, [...(lessonBySlot.get(lesson.slotId) ?? []), lesson]);
  });
  const periodRows = [...new Set(SLOTS.map((slot) => slot.period))].map((period) =>
    SLOTS.find((slot) => slot.period === period),
  );

  return (
    <div className="timetable-grid-scroll" role="region" aria-label={`${viewLabels[view]} thời khóa biểu`} tabIndex={0}>
      <div className="timetable-grid" role="grid" aria-label={`${viewLabels[view]} thời khóa biểu`}>
        <div className="timetable-corner" role="columnheader">
          <span>Ca / tiết</span>
          <small>Thứ trong tuần</small>
        </div>
        {DAYS.map((day) => (
          <div className="timetable-day-header" role="columnheader" key={day.day}>
            {day.label}
          </div>
        ))}
        {periodRows.map((firstSlot) => {
          if (!firstSlot) return null;
          return (
            <div className="timetable-grid-row" role="row" key={firstSlot.period}>
              <div className="timetable-row-header" role="rowheader">
                <strong>
                  {firstSlot.shiftLabel} · Tiết {firstSlot.period}
                </strong>
                <small>{firstSlot.timeLabel}</small>
              </div>
              {DAYS.map((day) => {
                const slot = SLOTS.find(
                  (candidate) => candidate.day === day.day && candidate.period === firstSlot.period,
                );
                const lessonsAtSlot = slot ? (lessonBySlot.get(slot.id) ?? []) : [];
                const slotPenalty = slot ? getSlotPenalty(slot.id) : 0;
                const heatLevel = heatmapEnabled ? getHeatLevel(slotPenalty) : 0;
                const isDropTarget = Boolean(slot && preview?.targetSlotId === slot.id);
                const dropState = isDropTarget ? (preview?.eligible ? "drop-valid" : "drop-invalid") : "";
                return (
                  <div
                    className={`timetable-cell heat-level-${heatLevel} ${dropState}`}
                    role="gridcell"
                    aria-label={`${day.label} · Tiết ${firstSlot.period} · mức phạt mềm ${slotPenalty}`}
                    onDragOver={(event) => {
                      if (!draggedLessonId || !slot) return;
                      event.preventDefault();
                      onDragOver(slot.id);
                    }}
                    onDrop={(event) => {
                      if (!draggedLessonId || !slot) return;
                      event.preventDefault();
                      onDrop(slot.id);
                    }}
                    key={day.day}
                  >
                    <div className="cell-content">
                      {lessonsAtSlot.length > 0 ? (
                        lessonsAtSlot.map((lesson) => (
                          <article
                            className={`lesson-card ${lesson.status === "CONFLICT" ? "conflict-card" : ""} ${draggedLessonId === lesson.id ? "dragging-card" : ""} ${lockedLessonIds.has(lesson.id) ? "locked-card" : ""} ${selectedLessonIds.has(lesson.id) ? "selected-card" : ""}`}
                            draggable={!lockedLessonIds.has(lesson.id)}
                            tabIndex={0}
                            aria-label={`${lesson.subjectLabel} · ${formatViewSubject(lesson, view)}. ${lockedLessonIds.has(lesson.id) ? "Đang khóa." : "Dùng phím mũi tên để đề xuất chuyển slot."}`}
                            onDragStart={(event) => {
                              if (lockedLessonIds.has(lesson.id)) {
                                event.preventDefault();
                                return;
                              }
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", lesson.id);
                              onDragStart(lesson.id);
                            }}
                            onDragEnd={onDragEnd}
                            onKeyDown={(event) => {
                              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                              event.preventDefault();
                              if (lockedLessonIds.has(lesson.id)) return;
                              onKeyboardMove(lesson.id, event.key as MoveDirection);
                            }}
                            key={lesson.id}
                          >
                            <div className="lesson-card-topline">
                              <label className="lesson-select">
                                <input
                                  type="checkbox"
                                  checked={selectedLessonIds.has(lesson.id)}
                                  aria-label={`Chọn ${lesson.subjectLabel} ${lesson.classLabel}`}
                                  onChange={() => onToggleSelection(lesson.id)}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <strong>{lesson.subjectLabel}</strong>
                              </label>
                              {lockedLessonIds.has(lesson.id) ? (
                                <span className="lock-badge" title="Lesson đang khóa" aria-label="Đang khóa">
                                  🔒
                                </span>
                              ) : null}
                              {lesson.status === "CONFLICT" ? (
                                <span
                                  className="conflict-marker"
                                  title={lesson.conflictMessage}
                                  aria-label="Có xung đột"
                                >
                                  !
                                </span>
                              ) : null}
                            </div>
                            <span>{formatViewSubject(lesson, view)}</span>
                            <small>{lesson.roomLabel}</small>
                            {lesson.conflictMessage ? <em>{lesson.conflictMessage}</em> : null}
                          </article>
                        ))
                      ) : (
                        <span className="empty-cell" aria-label="Trống">
                          ·
                        </span>
                      )}
                      {heatmapEnabled ? <span className="heatmap-label">Phạt mềm {slotPenalty}</span> : null}
                      {isDropTarget && preview ? (
                        <div className={`drop-preview ${preview.eligible ? "preview-valid" : "preview-invalid"}`}>
                          <strong>{preview.eligible ? "Đích hợp lệ" : "Đích bị chặn"}</strong>
                          <small>{preview.reason}</small>
                          <span>
                            Chênh lệch phạt mềm {preview.softPenaltyDelta > 0 ? "+" : ""}
                            {preview.softPenaltyDelta}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DEMO_REPAIR_REASON_CODE = "CLASS_AVAILABILITY_CONFLICT";
const DEMO_REPAIR_CHAIN: ConflictChain = {
  contractVersion: "CONFLICT-CHAIN-1.0.0",
  chainId: "chain:CLASS_AVAILABILITY_CONFLICT:demo",
  rootCode: DEMO_REPAIR_REASON_CODE,
  nodes: [
    {
      nodeId: "demo:constraint",
      type: "CONSTRAINT",
      label: "Lớp 7A không còn slot khả dụng sau khi áp dụng change event.",
      references: { code: DEMO_REPAIR_REASON_CODE },
    },
    {
      nodeId: "demo:class",
      type: "ENTITY",
      label: "classId=class-7a1",
      references: { classId: "class-7a1" },
    },
    {
      nodeId: "demo:lesson",
      type: "ENTITY",
      label: "lessonId=lesson-conflict-7a1",
      references: { lessonId: "lesson-conflict-7a1" },
    },
    {
      nodeId: "demo:slot",
      type: "ENTITY",
      label: "slotId=wed-2",
      references: { slotId: "wed-2" },
    },
    {
      nodeId: "demo:outcome",
      type: "OUTCOME",
      label: "Không thể tạo lịch hợp lệ.",
      references: { outcome: "INFEASIBLE" },
    },
  ],
  edges: [
    { from: "demo:class", to: "demo:constraint", relation: "CAUSES" },
    { from: "demo:lesson", to: "demo:constraint", relation: "CAUSES" },
    { from: "demo:slot", to: "demo:constraint", relation: "CAUSES" },
    { from: "demo:constraint", to: "demo:outcome", relation: "RESULTS_IN" },
  ],
};
const DEMO_RELAXATION_PROPOSALS: RelaxationProposal[] = [
  {
    proposalId: "relax:SOFT_RULE_WEIGHT:RULE-TEACHER-PREFERRED-DAY:teacher-1",
    rank: 1,
    kind: "SOFT_RULE_WEIGHT",
    targetCode: "RULE-TEACHER-PREFERRED-DAY",
    priorityScore: 1200,
    affectedLessonCount: 2,
    affectedEntityIds: ["teacher-1", "lesson-conflict-7a1"],
    ruleSource: {
      sourceUrl: "https://schedule.local/rules/pilot-soft-preference",
      ruleSnapshotId: "snapshot-demo-1",
      ruleSetVersion: "RULE-SET-1.0.0",
    },
    impact: "Có thể mở thêm khung tiết cho 2 buổi học; không tự thay đổi quy tắc.",
    requiresApproval: true,
    autoApply: false,
    hardRuleProtected: false,
  },
  {
    proposalId: "relax:STAKEHOLDER_HARD_RULE_REVIEW:RULE-CLASS-UNAVAILABLE:class-7a1",
    rank: 2,
    kind: "STAKEHOLDER_HARD_RULE_REVIEW",
    targetCode: "RULE-CLASS-UNAVAILABLE",
    priorityScore: 1000,
    affectedLessonCount: 1,
    affectedEntityIds: ["class-7a1", "lesson-conflict-7a1"],
    ruleSource: {
      sourceUrl: "https://schedule.local/rules/pilot-hard-rule",
      ruleSnapshotId: "snapshot-demo-1",
      ruleSetVersion: "RULE-SET-1.0.0",
    },
    impact: "Ràng buộc cứng chỉ được bên liên quan có thẩm quyền rà soát; không được tự nới lỏng.",
    requiresApproval: true,
    autoApply: false,
    hardRuleProtected: true,
  },
];

interface LocalRepairPreviewState {
  contractVersion: "LOCAL-REPAIR-1.0.0";
  baselineSnapshotHash: string;
  affectedAssignmentKeys: string[];
  frozenAssignmentKeys: string[];
  movedAssignmentCount: number;
  preservedAssignmentCount: number;
  outsideScopeUnchanged: boolean;
}

function RepairExplanationPanel({
  selectedLessonCount,
  lockedLessonCount,
  repairPreview,
  notice,
  onPreview,
  onConfirm,
}: {
  selectedLessonCount: number;
  lockedLessonCount: number;
  repairPreview: LocalRepairPreviewState | null;
  notice: string;
  onPreview: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="panel repair-panel" aria-labelledby="repair-panel-title">
      <div className="repair-heading">
        <div>
          <p className="eyebrow">P3.2-T02 · T03 · T04</p>
          <h3 id="repair-panel-title">Giải thích xung đột và sửa cục bộ</h3>
          <p className="small-note">
            Bản xem trước dùng mã băm đường cơ sở, vùng ảnh hưởng và phạm vi đã đóng băng. Giao diện không tự hạ ràng
            buộc cứng, không tự công bố và không thay thế việc kiểm tra của máy chủ/bộ tối ưu.
          </p>
        </div>
        <span className="contract-pill">LOCAL-REPAIR-1.0.0</span>
      </div>
      <div className="repair-summary" aria-label="Tóm tắt phạm vi sửa cục bộ">
        <span>
          Đã chọn: <b>{selectedLessonCount}</b> phân công
        </span>
        <span>
          Đã đóng băng: <b>{lockedLessonCount}</b> phân công
        </span>
        <span>
          Lý do: <b>{DEMO_REPAIR_REASON_CODE}</b>
        </span>
      </div>
      <div className="repair-grid">
        <div className="repair-chain-card">
          <strong>Chuỗi nguyên nhân có thể kiểm chứng</strong>
          <ol className="repair-chain-list" aria-label="Chuỗi nguyên nhân">
            {DEMO_REPAIR_CHAIN.nodes.map((node) => (
              <li key={node.nodeId}>
                <span className={`chain-node chain-node-${node.type.toLowerCase()}`}>{node.type}</span>
                <span>{node.label}</span>
              </li>
            ))}
          </ol>
          <small>
            {DEMO_REPAIR_CHAIN.contractVersion} · {DEMO_REPAIR_CHAIN.chainId}
          </small>
        </div>
        <div className="repair-proposals-card">
          <strong>Đề xuất nới lỏng</strong>
          <ul className="repair-proposal-list" aria-label="Đề xuất nới lỏng theo thứ hạng">
            {DEMO_RELAXATION_PROPOSALS.map((proposal) => (
              <li key={proposal.proposalId}>
                <div>
                  <span className="proposal-rank">#{proposal.rank}</span>
                  <b>{proposal.targetCode}</b>
                </div>
                <small>{proposal.impact}</small>
                <span className={proposal.hardRuleProtected ? "proposal-protected" : "proposal-approval"}>
                  {proposal.hardRuleProtected
                    ? "Ràng buộc cứng · bắt buộc phê duyệt"
                    : "Ràng buộc mềm · bắt buộc phê duyệt"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="repair-actions">
        <button type="button" onClick={onPreview}>
          Tạo bản xem trước sửa lỗi
        </button>
        <button className="button-secondary" type="button" onClick={onConfirm} disabled={!repairPreview}>
          Xác nhận áp dụng bản sửa lỗi nháp
        </button>
        {repairPreview ? (
          <span className="repair-preview-result" role="status" aria-live="polite">
            {repairPreview.movedAssignmentCount} lần chuyển · ngoài phạm vi giữ nguyên:{" "}
            {repairPreview.outsideScopeUnchanged ? "Có" : "Không"}
          </span>
        ) : null}
      </div>
      {notice ? (
        <div className="version-notice" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
    </section>
  );
}

export function TimetableScreen() {
  const [lessons, setLessons] = useState(DEMO_LESSONS);
  const [view, setView] = useState<TimetableView>("class");
  const [selectedEntityId, setSelectedEntityId] = useState("class-7a1");
  const [state, setState] = useState<TimetableState>(readInitialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [draggedLessonId, setDraggedLessonId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null);
  const [lastMove, setLastMove] = useState<CommittedMove | null>(null);
  const [lockScope, setLockScope] = useState<LockScope>("lesson");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [lockRecords, setLockRecords] = useState<TimetableLockRecord[]>([]);
  const [lastLockAction, setLastLockAction] = useState<LockUndoState | null>(null);
  const [manualHistory, setManualHistory] = useState<ManualHistoryEntry[]>([]);
  const [compareResult, setCompareResult] = useState<ScheduleVersionCompareResult>(() =>
    buildLocalCompare(DEMO_LESSONS),
  );
  const [versionNotice, setVersionNotice] = useState("Đang xem bản nháp cục bộ từ phiên bản đã công bố v1.");
  const [draftVersionLabel, setDraftVersionLabel] = useState("Bản nháp v2 · nhân bản từ phiên bản đã công bố v1");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("LOCKED");
  const [exportNotice, setExportNotice] = useState("Sẵn sàng xuất từ phiên bản thời khóa biểu được chọn trên máy chủ.");
  const [exportingView, setExportingView] = useState<"all" | TimetableView | null>(null);
  const [repairPreview, setRepairPreview] = useState<LocalRepairPreviewState | null>(null);
  const [repairNotice, setRepairNotice] = useState("");

  const entities = useMemo(() => getEntityOptions(view, lessons), [lessons, view]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? entities[0];
  const selectedId = selectedEntity?.id ?? "";
  const filteredLessons = useMemo(
    () =>
      lessons.filter((lesson) => {
        if (!lessonMatchesSearch(lesson, searchQuery)) return false;
        if (focusFilter === "conflict" && lesson.status !== "CONFLICT") return false;
        if (focusFilter === "penalty" && getSlotPenalty(lesson.slotId) < 1) return false;
        return true;
      }),
    [focusFilter, lessons, searchQuery],
  );
  const selectedLessons = filteredLessons.filter((lesson) => lesson[viewKeys[view]] === selectedId);
  const selectedLessonIdSet = useMemo(() => new Set(selectedLessonIds), [selectedLessonIds]);
  const lockedLessonIds = useMemo(() => new Set(lockRecords.flatMap((record) => record.lessonIds)), [lockRecords]);
  const solverLockInput = useMemo(() => buildLockedAssignmentsContract(lockRecords, lessons), [lessons, lockRecords]);
  const lockPlan = useMemo(
    () => createLockRecords(lockScope, selectedLessonIds, lessons),
    [lessons, lockScope, selectedLessonIds],
  );
  const newLockPlan = lockPlan.filter((record) => !lockRecords.some((existing) => existing.id === record.id));
  const unlockPlan = lockRecords.filter((record) =>
    record.lessonIds.some((lessonId) => selectedLessonIdSet.has(lessonId)),
  );
  const canManageLocks = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "SCHEDULER";
  const canApprovePublish = frontendConfig.actorRole === "ADMIN" || frontendConfig.actorRole === "REVIEWER";
  const visibleCount = selectedLessons.length;
  const conflictCount = selectedLessons.filter((lesson) => lesson.status === "CONFLICT").length;
  const workloadDays = new Set(selectedLessons.map((lesson) => SLOTS.find((slot) => slot.id === lesson.slotId)?.day))
    .size;

  function recordManualHistory(kind: ManualHistoryKind, summary: string, detail: string) {
    setManualHistory((current) => [
      {
        id: `${kind}-${Date.now()}-${current.length}`,
        kind,
        summary,
        detail,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
  }

  function previewMove(lessonId: string, targetSlotId: string) {
    setMovePreview(
      lockedLessonIds.has(lessonId)
        ? createLockedMovePreview(lessonId, targetSlotId, lessons)
        : createMovePreview(lessonId, targetSlotId, lessons),
    );
  }

  function handleConfirmMove() {
    if (!movePreview?.eligible) return;
    setLessons((currentLessons) =>
      currentLessons.map((lesson) =>
        lesson.id === movePreview.lessonId ? { ...lesson, slotId: movePreview.targetSlotId } : lesson,
      ),
    );
    setLastMove({
      lessonId: movePreview.lessonId,
      fromSlotId: movePreview.fromSlotId,
      targetSlotId: movePreview.targetSlotId,
    });
    recordManualHistory(
      "MOVE",
      `Di chuyển ${previewLesson?.subjectLabel ?? "phân công"}`,
      `${movePreview.fromSlotId} → ${movePreview.targetSlotId} · bản nháp cục bộ; máy chủ sẽ kiểm tra lại`,
    );
    setCompareResult(
      buildLocalCompare(
        lessons.map((lesson) =>
          lesson.id === movePreview.lessonId ? { ...lesson, slotId: movePreview.targetSlotId } : lesson,
        ),
      ),
    );
    setMovePreview(null);
  }

  function handleUndoMove() {
    if (!lastMove) return;
    setLessons((currentLessons) =>
      currentLessons.map((lesson) =>
        lesson.id === lastMove.lessonId ? { ...lesson, slotId: lastMove.fromSlotId } : lesson,
      ),
    );
    recordManualHistory(
      "UNDO",
      "Hoàn tác di chuyển",
      `${lastMove.targetSlotId} → ${lastMove.fromSlotId} · bản nháp cục bộ`,
    );
    setLastMove(null);
  }

  function handleKeyboardMove(lessonId: string, direction: MoveDirection) {
    if (lockedLessonIds.has(lessonId)) {
      const lesson = lessons.find((candidate) => candidate.id === lessonId);
      const sourceSlot = SLOTS.find((slot) => slot.id === lesson?.slotId);
      const targetSlot = sourceSlot
        ? SLOTS.find(
            (slot) =>
              slot.day === sourceSlot.day + (direction === "ArrowLeft" ? -1 : direction === "ArrowRight" ? 1 : 0) &&
              slot.period === sourceSlot.period + (direction === "ArrowUp" ? -1 : direction === "ArrowDown" ? 1 : 0),
          )
        : null;
      if (targetSlot) setMovePreview(createLockedMovePreview(lessonId, targetSlot.id, lessons));
      return;
    }
    const preview = moveTargetByKeyboard(lessonId, direction, lessons);
    if (preview) setMovePreview(preview);
  }

  function toggleLessonSelection(lessonId: string) {
    setSelectedLessonIds((current) =>
      current.includes(lessonId) ? current.filter((id) => id !== lessonId) : [...current, lessonId],
    );
  }

  function selectVisibleLessons() {
    setSelectedLessonIds((current) => [...new Set([...current, ...selectedLessons.map((lesson) => lesson.id)])]);
  }

  function clearLessonSelection() {
    setSelectedLessonIds([]);
  }

  function applyLockAction(action: "lock" | "unlock") {
    if (!canManageLocks || selectedLessonIds.length === 0) return;
    const previousLocks = lockRecords;
    if (action === "lock") {
      if (newLockPlan.length === 0) return;
      setLockRecords((current) => [...current, ...newLockPlan]);
      setLastLockAction({
        previousLocks,
        message: `Đã khóa ${newLockPlan.reduce((total, record) => total + record.lessonIds.length, 0)} phân công theo phạm vi ${lockScope}.`,
      });
      recordManualHistory(
        "LOCK",
        "Khóa phân công",
        `${newLockPlan.length} phạm vi · ${newLockPlan.reduce((total, record) => total + record.lessonIds.length, 0)} phân công`,
      );
      return;
    }
    if (unlockPlan.length === 0) return;
    setLockRecords((current) => current.filter((record) => !unlockPlan.some((target) => target.id === record.id)));
    setLastLockAction({ previousLocks, message: `Đã mở khóa ${unlockPlan.length} phạm vi.` });
    recordManualHistory("UNLOCK", "Mở khóa phân công", `${unlockPlan.length} phạm vi · bản nháp cục bộ`);
  }

  function undoLockAction() {
    if (!lastLockAction) return;
    setLockRecords(lastLockAction.previousLocks);
    recordManualHistory("UNDO", "Hoàn tác khóa", "Khôi phục trạng thái khóa trước đó · bản nháp cục bộ");
    setLastLockAction(null);
  }

  function refreshCompare() {
    setCompareResult(buildLocalCompare(lessons));
    setVersionNotice("Đã tính lại phần chênh lệch theo bản chụp bản nháp cục bộ; API máy chủ sẽ là nguồn chính thức.");
  }

  function cloneDraft() {
    setDraftVersionLabel("Bản nháp v3 · nhân bản từ phiên bản đã công bố v1");
    setVersionNotice("Đã tạo bản nháp mới từ bản chụp đã công bố; phiên bản đã công bố vẫn không thể thay đổi.");
    recordManualHistory(
      "CLONE",
      "Nhân bản phương án",
      "Phiên bản đã công bố v1 → bản nháp v3 · người thực hiện local-qc-user",
    );
  }

  function rollbackToPublished() {
    setLessons(DEMO_LESSONS);
    setLockRecords([]);
    setLastMove(null);
    setDraftVersionLabel("Bản nháp v4 · khôi phục từ phiên bản đã công bố v1");
    setVersionNotice("Đã tạo bản nháp mới từ bản chụp đã công bố; không thay đổi phiên bản đã công bố.");
    setCompareResult(buildLocalCompare(DEMO_LESSONS));
    recordManualHistory(
      "ROLLBACK",
      "Khôi phục phương án",
      "Bản nháp hiện tại → phiên bản đã công bố v1 · bắt buộc có lý do",
    );
  }

  function transitionWorkflow(target: "APPROVED" | "PUBLISHED") {
    if (!canApprovePublish) return;
    if (target === "APPROVED" && workflowStatus !== "IN_REVIEW") return;
    if (target === "PUBLISHED" && workflowStatus !== "LOCKED") return;
    setWorkflowStatus(target);
    recordManualHistory(
      target === "APPROVED" ? "APPROVE" : "PUBLISH",
      target === "APPROVED" ? "Phê duyệt phương án" : "Công bố phương án",
      `${target} · người thực hiện ${frontendConfig.actorId} · máy chủ sẽ kiểm tra cổng và ghi thời điểm`,
    );
  }

  function previewLocalRepair() {
    const affectedIds =
      selectedLessonIds.length > 0
        ? selectedLessonIds
        : lessons.filter((lesson) => lesson.status === "CONFLICT").map((lesson) => lesson.id);
    const frozenIds = lessons.filter((lesson) => lockedLessonIds.has(lesson.id)).map((lesson) => lesson.id);
    const movableAffected = affectedIds.filter((lessonId) => !frozenIds.includes(lessonId));
    const nextPreview: LocalRepairPreviewState = {
      contractVersion: "LOCAL-REPAIR-1.0.0",
      baselineSnapshotHash: "a".repeat(64),
      affectedAssignmentKeys: affectedIds.map((lessonId) => `${lessonId}:0`).sort(),
      frozenAssignmentKeys: frozenIds.map((lessonId) => `${lessonId}:0`).sort(),
      movedAssignmentCount: movableAffected.length > 0 ? 1 : 0,
      preservedAssignmentCount: Math.max(0, movableAffected.length - 1),
      outsideScopeUnchanged: true,
    };
    setRepairPreview(nextPreview);
    setRepairNotice("Đã tạo bản xem trước từ đường cơ sở; chưa thay đổi bản nháp và chưa gửi yêu cầu đến máy chủ.");
    recordManualHistory(
      "REPAIR_PREVIEW",
      "Tạo bản xem trước sửa lỗi cục bộ",
      `${nextPreview.affectedAssignmentKeys.length} đối tượng ảnh hưởng · ${nextPreview.frozenAssignmentKeys.length} đối tượng đã đóng băng`,
    );
  }

  function confirmLocalRepair() {
    if (!repairPreview) return;
    setRepairNotice(
      "Đã xác nhận bản sửa lỗi nháp để rà soát; máy chủ vẫn phải kiểm tra lại ràng buộc cứng, ETag và quyền trước khi ghi.",
    );
    recordManualHistory(
      "REPAIR_CONFIRM",
      "Xác nhận bản sửa lỗi nháp",
      `${repairPreview.movedAssignmentCount} lần chuyển · đường cơ sở ${repairPreview.baselineSnapshotHash.slice(0, 8)}…`,
    );
  }

  async function exportWorkbook(viewToExport: "all" | TimetableView) {
    setExportingView(viewToExport);
    setExportNotice("Đang tạo tệp Excel từ bản chụp trên máy chủ...");
    try {
      const response = await fetch(
        `${frontendConfig.apiBaseUrl}/schools/${frontendConfig.schoolId}/schedule-versions/${frontendConfig.scheduleVersionId}/export.xlsx?view=${viewToExport}`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? `Export thất bại (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? `schedule-version-${viewToExport}.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportNotice(
        `Đã tải ${filename}; tệp Excel giữ nguyên siêu dữ liệu phiên bản/trạng thái và đối soát bản chụp.`,
      );
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "Không thể xuất tệp Excel.");
    } finally {
      setExportingView(null);
    }
  }

  function handleViewChange(nextView: TimetableView) {
    const nextEntities = getEntityOptions(nextView, lessons);
    setView(nextView);
    setSelectedEntityId(nextEntities[0]?.id ?? "");
  }

  const previewLesson = movePreview ? lessons.find((lesson) => lesson.id === movePreview.lessonId) : null;
  const previewTargetSlot = movePreview ? SLOTS.find((slot) => slot.id === movePreview.targetSlotId) : null;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Bước 04 · Tối ưu và rà soát</p>
          <h1>Thời khóa biểu</h1>
          <p className="lead">
            Một phương án, ba góc nhìn nghiệp vụ — cùng phân công, cùng khung tiết và cùng dấu xung đột.
          </p>
        </div>
        <div className="page-header-action">
          <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
            ← Quay lại nhập dữ liệu
          </button>
        </div>
      </div>

      <OptimizationJobPanel />

      <section className="panel timetable-shell" aria-labelledby="timetable-title">
        <div className="timetable-toolbar">
          <div>
            <p className="eyebrow">Không gian bản nháp · phương án minh họa</p>
            <h2 id="timetable-title">Rà soát phân công theo tài nguyên</h2>
            <p className="small-note">
              Dữ liệu mẫu minh họa hợp đồng `SolveJobResult`; ràng buộc cứng vẫn thuộc máy chủ/bộ tối ưu.
            </p>
          </div>
          <span className="solve-status feasible-status">KHẢ THI · 842 ms</span>
        </div>

        <div className="timetable-controls" aria-label="Bộ lọc thời khóa biểu">
          <div className="view-switcher" role="tablist" aria-label="Góc nhìn thời khóa biểu">
            {(Object.keys(viewLabels) as TimetableView[]).map((option) => (
              <button
                className={view === option ? "view-tab active" : "view-tab"}
                type="button"
                role="tab"
                aria-selected={view === option}
                key={option}
                onClick={() => handleViewChange(option)}
              >
                {viewLabels[option]}
              </button>
            ))}
          </div>
          <label className="entity-picker">
            <span>{viewLabels[view]}</span>
            <select
              aria-label={`${viewLabels[view]} chọn`}
              value={selectedId}
              onChange={(event) => setSelectedEntityId(event.target.value)}
            >
              {entities.map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </label>
          <label className="search-picker">
            <span>Tìm trong thời khóa biểu</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="Môn, lớp, GV, phòng"
              aria-label="Tìm trong thời khóa biểu"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <label className="focus-picker">
            <span>Lọc nhanh</span>
            <select
              aria-label="Lọc nhanh"
              value={focusFilter}
              onChange={(event) => setFocusFilter(event.target.value as FocusFilter)}
            >
              <option value="all">Tất cả phân công</option>
              <option value="conflict">Chỉ xung đột</option>
              <option value="penalty">Có phạt mềm</option>
            </select>
          </label>
          <label className="state-picker">
            <span>Trạng thái demo</span>
            <select
              aria-label="Trạng thái demo"
              value={state}
              onChange={(event) => setState(event.target.value as TimetableState)}
            >
              <option value="ready">Có dữ liệu</option>
              <option value="loading">Đang tải</option>
              <option value="empty">Trống</option>
              <option value="error">Lỗi API</option>
            </select>
          </label>
          <label className="heatmap-toggle">
            <input
              type="checkbox"
              checked={heatmapEnabled}
              onChange={(event) => setHeatmapEnabled(event.target.checked)}
            />
            <span>Bản đồ nhiệt phạt mềm</span>
          </label>
        </div>

        <section className="lock-panel" aria-labelledby="lock-panel-title">
          <div className="lock-panel-heading">
            <div>
              <p className="eyebrow">P2.3-T04 · Phạm vi đóng băng</p>
              <h3 id="lock-panel-title">Khóa các phân công đã thống nhất</h3>
              <p className="small-note">
                Chọn phân công trên lưới rồi áp dụng phạm vi. Việc khóa được chuẩn bị trong dữ liệu đầu vào bộ tối ưu ở
                hợp đồng {LOCKED_ASSIGNMENTS_CONTRACT_VERSION}; máy chủ/bộ tối ưu vẫn là nơi kiểm tra cuối.
              </p>
            </div>
            <span className={canManageLocks ? "permission-chip write" : "permission-chip read"}>
              {canManageLocks ? "Có quyền khóa" : "Chỉ đọc · cần quyền SCHEDULER/ADMIN"}
            </span>
          </div>
          <div className="lock-controls">
            <label className="lock-scope-picker">
              <span>Phạm vi khóa</span>
              <select
                aria-label="Phạm vi khóa"
                value={lockScope}
                onChange={(event) => setLockScope(event.target.value as LockScope)}
              >
                <option value="lesson">Phân công đã chọn</option>
                <option value="teacher">Toàn bộ giáo viên</option>
                <option value="day">Toàn bộ ngày</option>
              </select>
            </label>
            <button
              className="button-secondary"
              type="button"
              onClick={selectVisibleLessons}
              disabled={selectedLessons.length === 0}
            >
              Chọn {selectedLessons.length} phân công đang xem
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={clearLessonSelection}
              disabled={selectedLessonIds.length === 0}
            >
              Bỏ chọn
            </button>
            <span className="lock-preview-count" role="status" aria-live="polite">
              Đã chọn <b>{selectedLessonIds.length}</b> · khóa mới <b>{newLockPlan.length}</b> phạm vi · mở khóa{" "}
              <b>{unlockPlan.length}</b>
            </span>
            <button
              type="button"
              onClick={() => applyLockAction("lock")}
              disabled={!canManageLocks || selectedLessonIds.length === 0 || newLockPlan.length === 0}
            >
              🔒 Khóa đã chọn
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => applyLockAction("unlock")}
              disabled={!canManageLocks || selectedLessonIds.length === 0 || unlockPlan.length === 0}
            >
              Mở khóa
            </button>
          </div>
          {lockRecords.length > 0 ? (
            <div className="lock-summary" aria-label="Các phạm vi đang khóa">
              <strong>Đang khóa {lockedLessonIds.size} phân công</strong>
              <span className="lock-summary-item">
                Dữ liệu đầu vào bộ tối ưu: {solverLockInput.assignments.length} phân công ·{" "}
                {solverLockInput.contractVersion}
              </span>
              {lockRecords.map((record) => (
                <span className="lock-summary-item" key={record.id}>
                  🔒 {record.scopeLabel} · {record.lessonIds.length} phân công
                </span>
              ))}
            </div>
          ) : (
            <p className="small-note lock-empty-note">Chưa có phạm vi nào bị khóa trong bản nháp cục bộ.</p>
          )}
        </section>
        {lastLockAction ? (
          <div className="alert alert-success lock-success" role="status">
            <strong>{lastLockAction.message}</strong>
            <span>Xem trước cục bộ; khi gửi yêu cầu tối ưu, máy chủ phải xác thực lại quyền và ràng buộc cứng.</span>
            <button className="button-secondary" type="button" onClick={undoLockAction}>
              Hoàn tác khóa
            </button>
          </div>
        ) : null}

        <div className="solve-summary" aria-label="Tóm tắt phương án">
          <span>
            <b>{selectedEntity?.label ?? "—"}</b> · {selectedEntity?.detail ?? "Chưa chọn"}
          </span>
          <span>{visibleCount} phân công</span>
          <span>
            Khối lượng <b>{workloadDays}/5 ngày</b>
          </span>
          <span>
            Chênh lệch giáo viên <b>{formatMetric(DEMO_OBJECTIVE.teacherGap)} điểm phạt</b>
          </span>
          <span className={conflictCount > 0 ? "summary-warning" : "summary-ok"}>
            {conflictCount > 0 ? `${conflictCount} xung đột cần rà soát` : "Không có xung đột"}
          </span>
          <span>Mục tiêu {formatMetric(DEMO_OBJECTIVE.weightedTotal)} · chênh lệch 0%</span>
        </div>

        <section className="quality-panel" aria-labelledby="quality-title">
          <div className="quality-heading">
            <div>
              <p className="eyebrow">Chỉ số chất lượng</p>
              <h3 id="quality-title">Phân rã điểm phạt mềm</h3>
              <p className="small-note">
                Đồng bộ theo `diagnostics.objectiveBreakdown`; điểm thấp hơn là tốt hơn sau khi đã đạt khả năng thỏa mãn
                ràng buộc cứng.
              </p>
            </div>
            <div className="objective-total">
              <span>Tổng có trọng số</span>
              <strong>{formatMetric(DEMO_OBJECTIVE.weightedTotal)}</strong>
              <small>SOLVER-OBJECTIVE-1.0.0</small>
            </div>
          </div>
          <div className="quality-metrics">
            {OBJECTIVE_GROUPS.map((group) => (
              <div className="quality-metric" key={group.key} title={group.description}>
                <div className="quality-metric-label">
                  <span>{group.label}</span>
                  <b>{formatMetric(DEMO_OBJECTIVE[group.key])}</b>
                </div>
                <div className="quality-meter" aria-label={`${group.label}: ${DEMO_OBJECTIVE[group.key]}`}>
                  <span style={{ width: `${Math.min(100, DEMO_OBJECTIVE[group.key] * 8)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="heatmap-legend" aria-label="Chú thích bản đồ nhiệt phạt mềm">
            <span>Ô bản đồ nhiệt</span>
            {[0, 1, 2, 3].map((level) => (
              <span className="heatmap-key" key={level}>
                <i className={`heatmap-swatch heat-level-${level}`} aria-hidden="true" />
                {level === 0 ? "0 · không phạt" : level === 3 ? "3+ · cao" : `${level} · thấp`}
              </span>
            ))}
            <span className="heatmap-legend-note">Màu luôn đi kèm nhãn mức phạt để không phụ thuộc vào màu sắc.</span>
          </div>
        </section>

        <RepairExplanationPanel
          selectedLessonCount={selectedLessonIds.length}
          lockedLessonCount={lockedLessonIds.size}
          repairPreview={repairPreview}
          notice={repairNotice}
          onPreview={previewLocalRepair}
          onConfirm={confirmLocalRepair}
        />

        <section className="version-panel" aria-labelledby="version-panel-title">
          <div className="version-heading">
            <div>
              <p className="eyebrow">P2.4-T02 · Quản lý kịch bản</p>
              <h3 id="version-panel-title">So sánh / nhân bản / khôi phục phương án</h3>
              <p className="small-note">
                <b>{draftVersionLabel}</b> · Phiên bản đã công bố v1 không thể thay đổi; mọi thao tác nhân bản/khôi phục
                tạo bản nháp mới và ghi người thực hiện, lý do, phiên bản nguồn vào nhật ký máy chủ.
              </p>
            </div>
            <span className="version-contract-badge">SCHEDULE-VERSION-OPS-1.0.0</span>
          </div>
          <div className="version-actions">
            <button type="button" onClick={refreshCompare}>
              So sánh bản chụp
            </button>
            <button className="button-secondary" type="button" onClick={cloneDraft}>
              Nhân bản thành bản nháp
            </button>
            <button className="button-secondary" type="button" onClick={rollbackToPublished}>
              Khôi phục bản chụp cũ
            </button>
          </div>
          <div className="version-notice" role="status" aria-live="polite">
            {versionNotice}
          </div>
          <div className="version-score-grid" aria-label="Chênh lệch điểm giữa hai phương án">
            <span>
              Thay đổi <b>{compareResult.summary.changedAssignments}</b>
            </span>
            <span>
              Chuyển <b>{compareResult.summary.moves}</b>
            </span>
            <span>
              Thêm / xóa{" "}
              <b>
                {compareResult.summary.additions} / {compareResult.summary.removals}
              </b>
            </span>
            <span>
              Chênh lệch điểm{" "}
              <b>
                {compareResult.score.delta === null
                  ? "Không có"
                  : `${compareResult.score.delta > 0 ? "+" : ""}${compareResult.score.delta}`}
              </b>
            </span>
          </div>
          {compareResult.diffs.length > 0 ? (
            <ol className="version-diff-list" aria-label="Bản chênh lệch phương án">
              {compareResult.diffs.map((diff) => (
                <li key={`${diff.lessonId}-${diff.sessionIndex}`} className="version-diff-item">
                  <span className={`diff-operation diff-operation-${diff.operation.toLowerCase()}`}>
                    {DIFF_OPERATION_LABELS[diff.operation] ?? diff.operation}
                  </span>
                  <div>
                    <strong>{diff.after?.subjectLabel ?? diff.before?.subjectLabel ?? diff.lessonId}</strong>
                    <p>
                      {diff.before?.slotLabel ?? "—"} → {diff.after?.slotLabel ?? "—"}
                      {diff.before?.roomLabel || diff.after?.roomLabel
                        ? ` · ${diff.before?.roomLabel ?? "—"} → ${diff.after?.roomLabel ?? "—"}`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small-note version-empty">Hai bản chụp không có thay đổi phân công.</p>
          )}
        </section>

        <section className="workflow-panel" aria-labelledby="workflow-panel-title">
          <div className="workflow-heading">
            <div>
              <p className="eyebrow">P2.4-T03 · Cổng phê duyệt</p>
              <h3 id="workflow-panel-title">Quyền phê duyệt và công bố</h3>
              <p className="small-note">
                Vai trò hiện tại: <b>{frontendConfig.actorRole}</b> · chỉ ADMIN/REVIEWER được phê duyệt hoặc công bố;
                API vẫn kiểm tra cổng ràng buộc và ghi thời điểm vào nhật ký.
              </p>
            </div>
            <span className={`workflow-status workflow-status-${workflowStatus.toLowerCase()}`}>
              {WORKFLOW_STATUS_LABELS[workflowStatus]}
            </span>
          </div>
          <div className="workflow-actions">
            <button
              type="button"
              onClick={() => transitionWorkflow("APPROVED")}
              disabled={!canApprovePublish || workflowStatus !== "IN_REVIEW"}
            >
              Phê duyệt phương án
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => transitionWorkflow("PUBLISHED")}
              disabled={!canApprovePublish || workflowStatus !== "LOCKED"}
            >
              Công bố phương án
            </button>
          </div>
          <p className="small-note workflow-note">
            Bản xem trước cục bộ chỉ mô phỏng trạng thái; người lập lịch không thể tự phê duyệt. Công bố thật chỉ thành
            công sau khi vượt qua cổng kiểm tra đầy đủ, phạm vi và ràng buộc cứng về lớp/giáo viên/phòng tại
            NestJS/PostgreSQL.
          </p>
        </section>

        <section className="export-panel" aria-labelledby="export-panel-title">
          <div className="export-heading">
            <div>
              <p className="eyebrow">P2.4-T04 · Workbook chính thức</p>
              <h3 id="export-panel-title">Xuất Excel theo lớp, giáo viên và phòng</h3>
              <p className="small-note">
                Máy chủ xuất dữ liệu từ phiên bản <b>{frontendConfig.scheduleVersionId}</b>; UI chỉ khởi chạy yêu cầu,
                không thay thế quyền hạn hoặc cổng ràng buộc cứng.
              </p>
            </div>
            <span className="export-contract-badge">SCHEDULE-EXPORT-1.0.0</span>
          </div>
          <div className="export-actions">
            <button type="button" onClick={() => exportWorkbook("all")} disabled={exportingView !== null}>
              {exportingView === "all" ? "Đang xuất..." : "Xuất đủ 3 góc nhìn"}
            </button>
            {(["class", "teacher", "room"] as const).map((viewToExport) => (
              <button
                className="button-secondary"
                type="button"
                key={viewToExport}
                onClick={() => exportWorkbook(viewToExport)}
                disabled={exportingView !== null}
              >
                {exportingView === viewToExport
                  ? "Đang xuất..."
                  : `Theo ${viewToExport === "class" ? "lớp" : viewToExport === "teacher" ? "giáo viên" : "phòng"}`}
              </button>
            ))}
          </div>
          <div className="export-notice" role="status" aria-live="polite">
            {exportNotice}
          </div>
        </section>

        {movePreview && previewLesson && previewTargetSlot ? (
          <section
            className={`move-review-panel ${movePreview.eligible ? "move-valid" : "move-invalid"}`}
            aria-live="polite"
          >
            <div>
              <p className="eyebrow">Xem trước tính hợp lệ</p>
              <h3>
                {movePreview.eligible ? "Có thể chuyển" : "Không thể chuyển"} {previewLesson.subjectLabel} →{" "}
                {previewTargetSlot.dayLabel} · Tiết {previewTargetSlot.period}
              </h3>
              <p>{movePreview.reason}</p>
              <small>
                Chênh lệch phạt mềm:{" "}
                <b>
                  {movePreview.softPenaltyDelta > 0 ? "+" : ""}
                  {movePreview.softPenaltyDelta}
                </b>{" "}
                · máy chủ phải xác nhận lại các ràng buộc cứng.
              </small>
            </div>
            <div className="move-actions">
              <button type="button" disabled={!movePreview.eligible} onClick={handleConfirmMove}>
                Xác nhận thay đổi
              </button>
              <button className="button-secondary" type="button" onClick={() => setMovePreview(null)}>
                Hủy
              </button>
            </div>
          </section>
        ) : null}
        {lastMove ? (
          <div className="alert alert-success move-success" role="status">
            <strong>Đã cập nhật vị trí phân công trong bản nháp cục bộ.</strong>
            <span>Chưa lưu vào nguồn chính thức; máy chủ sẽ kiểm tra lại trước khi ghi.</span>
            <button className="button-secondary" type="button" onClick={handleUndoMove}>
              Hoàn tác
            </button>
          </div>
        ) : null}

        <section className="history-panel" aria-labelledby="history-panel-title">
          <div className="history-heading">
            <div>
              <p className="eyebrow">P2.3-T06 · Nhật ký thao tác</p>
              <h3 id="history-panel-title">Lịch sử chỉnh tay</h3>
              <p className="small-note">
                Phiên cục bộ chỉ hiển thị siêu dữ liệu an toàn của chuyển/khóa/hoàn tác; nhật ký máy chủ là nguồn khớp
                với cơ sở dữ liệu và có mã đối soát.
              </p>
            </div>
            <span className="history-count" aria-label={`${manualHistory.length} thao tác trong phiên`}>
              {manualHistory.length} thao tác
            </span>
          </div>
          {manualHistory.length > 0 ? (
            <ol className="history-list" aria-label="Các thao tác chỉnh tay trong phiên">
              {manualHistory.slice(0, 8).map((entry) => (
                <li key={entry.id} className="history-item">
                  <span className={`history-kind history-kind-${entry.kind.toLowerCase()}`}>
                    {MANUAL_HISTORY_LABELS[entry.kind] ?? entry.kind}
                  </span>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.detail}</p>
                  </div>
                  <time dateTime={entry.createdAt}>{entry.createdAt.slice(11, 19)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small-note history-empty">Chưa có thao tác chỉnh tay trong phiên này.</p>
          )}
        </section>

        {state === "ready" ? (
          <TimetableGrid
            view={view}
            selectedEntityId={selectedId}
            lessons={filteredLessons}
            heatmapEnabled={heatmapEnabled}
            preview={movePreview}
            draggedLessonId={draggedLessonId}
            lockedLessonIds={lockedLessonIds}
            selectedLessonIds={selectedLessonIdSet}
            onDragStart={setDraggedLessonId}
            onDragEnd={() => setDraggedLessonId(null)}
            onDragOver={(targetSlotId) => {
              if (draggedLessonId) previewMove(draggedLessonId, targetSlotId);
            }}
            onDrop={(targetSlotId) => {
              if (draggedLessonId) {
                previewMove(draggedLessonId, targetSlotId);
                setDraggedLessonId(null);
              }
            }}
            onKeyboardMove={handleKeyboardMove}
            onToggleSelection={toggleLessonSelection}
          />
        ) : (
          <StatePanel state={state} />
        )}

        <div className="timetable-legend" aria-label="Chú thích thời khóa biểu">
          <span>
            <i className="legend-dot scheduled-dot" aria-hidden="true" /> Đã xếp
          </span>
          <span>
            <i className="legend-dot conflict-dot" aria-hidden="true" /> Xung đột cần rà soát
          </span>
          <span className="legend-note">
            Kéo phân công hoặc chọn thẻ rồi dùng phím mũi tên để xem trước tính hợp lệ.
          </span>
          <span className="legend-note">Múi giờ: Asia/Ho_Chi_Minh · tuần thí điểm</span>
        </div>
      </section>
    </>
  );
}

export type { TimetableState, TimetableView };
