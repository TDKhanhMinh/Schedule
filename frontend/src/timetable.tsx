import { useEffect, useMemo, useState } from "react";
import {
  type LockedAssignments,
  type ObjectiveBreakdown,
  type ScheduleVersionCompareResult,
  type ScheduleVersionDiffEntry,
} from "@schedule/backend/contracts";
import { authHeaders, frontendConfig } from "./config";
import { navigateTo } from "./routing";

const LOCKED_ASSIGNMENTS_CONTRACT_VERSION = "LOCKED-ASSIGNMENTS-1.0.0" as const;

type TimetableView = "class" | "teacher" | "room";
type TimetableState = "loading" | "ready" | "empty" | "error";
type WorkflowStatus = "IN_REVIEW" | "APPROVED" | "LOCKED" | "PUBLISHED";

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

type ManualHistoryKind = "MOVE" | "LOCK" | "UNLOCK" | "UNDO" | "CLONE" | "ROLLBACK" | "APPROVE" | "PUBLISH";

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
            payload && "message" in payload ? payload.message : `Không đọc được job (HTTP ${response.status}).`,
          );
        if (!disposed) {
          setStatus(payload as OptimizationJobStatus);
          setNotice("");
        }
      } catch (error) {
        if (!disposed) setNotice(error instanceof Error ? error.message : "Không thể đọc trạng thái job.");
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
      setNotice("Nhập job ID để theo dõi trạng thái durable.");
      return;
    }
    setStatus(null);
    setNotice("Đang tải trạng thái job...");
    setTrackedJobId(nextJobId);
    window.history.replaceState(null, "", `${window.location.pathname}?jobId=${encodeURIComponent(nextJobId)}`);
  }

  async function mutateJob(action: "cancel" | "retry") {
    if (!status) return;
    setBusy(true);
    setNotice(action === "cancel" ? "Đang gửi yêu cầu hủy..." : "Đang tạo retry job...");
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
          : "Đã tạo retry job với idempotency key.",
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
          <p className="eyebrow">Durable solve control</p>
          <h2 id="optimization-job-title">Theo dõi và điều khiển job</h2>
          <p className="small-note">PostgreSQL là nguồn trạng thái; UI chỉ gọi API và không quyết định correctness.</p>
        </div>
        {status ? <span className={`solve-status job-state-${status.state.toLowerCase()}`}>{status.state}</span> : null}
      </div>
      <div className="optimization-job-controls">
        <label>
          <span>Optimization job ID</span>
          <input value={jobIdInput} onChange={(event) => setJobIdInput(event.target.value)} placeholder="Nhập job ID" />
        </label>
        <button type="button" onClick={trackJob}>
          Theo dõi job
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
              Stage <b>{status.progress.stage}</b>
            </span>
            <span>
              Attempt{" "}
              <b>
                {status.attempts}/{status.maxAttempts}
              </b>
            </span>
            <span>
              Heartbeat{" "}
              <b>{status.progress.heartbeatAt ? new Date(status.progress.heartbeatAt).toLocaleString("vi-VN") : "—"}</b>
            </span>
            <span>
              Contract <b>{status.statusContractVersion}</b>
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
              Phát hiện job stalled/zombie; cần kiểm tra worker và execution log.
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
              Hủy solve
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => void mutateJob("retry")}
              disabled={busy || !status.canRetry}
            >
              Retry job
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

// The fixture mirrors the shared assignment shape until the solve-result read API is wired.
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
    conflictMessage: "GV An đang có hai lesson cùng Thứ 4 · Tiết 2.",
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
    conflictMessage: "GV An đang có hai lesson cùng Thứ 4 · Tiết 2.",
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
  { key: "undesirableSlots", label: "Slot không mong muốn", description: "undesirableSlots" },
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
      reason: `Không hợp lệ: ${resource} đã có lesson tại ${targetSlot.dayLabel} · Tiết ${targetSlot.period}.`,
      softPenaltyDelta,
    };
  }

  return {
    lessonId,
    fromSlotId: lesson.slotId,
    targetSlotId,
    eligible: true,
    reason: `Target hợp lệ: ${targetSlot.dayLabel} · ${targetSlot.shiftLabel} · Tiết ${targetSlot.period}.`,
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
        <h3>Đang tải solution</h3>
        <p>Đang đọc assignments và diagnostics từ solve job. Vui lòng chờ trong giây lát.</p>
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
        <p>API chưa trả về solution. Kiểm tra trạng thái job hoặc thử tải lại sau.</p>
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
      <h3>Chưa có assignment để hiển thị</h3>
      <p>Hãy Confirm dữ liệu và chạy solver trước khi mở các góc nhìn thời khóa biểu.</p>
      <button type="button" onClick={() => navigateTo("imports")}>
        Mở Import →
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
    <div className="timetable-grid-scroll" role="region" aria-label={`${viewLabels[view]} timetable`} tabIndex={0}>
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
                    aria-label={`${day.label} · Tiết ${firstSlot.period} · soft penalty ${slotPenalty}`}
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
                      {heatmapEnabled ? <span className="heatmap-label">Soft {slotPenalty}</span> : null}
                      {isDropTarget && preview ? (
                        <div className={`drop-preview ${preview.eligible ? "preview-valid" : "preview-invalid"}`}>
                          <strong>{preview.eligible ? "Target hợp lệ" : "Target bị chặn"}</strong>
                          <small>{preview.reason}</small>
                          <span>
                            Soft delta {preview.softPenaltyDelta > 0 ? "+" : ""}
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
  const [versionNotice, setVersionNotice] = useState("Đang xem draft local từ bản published v1.");
  const [draftVersionLabel, setDraftVersionLabel] = useState("Draft v2 · clone từ Published v1");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("LOCKED");
  const [exportNotice, setExportNotice] = useState("Sẵn sàng xuất từ schedule version được chọn ở server.");
  const [exportingView, setExportingView] = useState<"all" | TimetableView | null>(null);

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
      `Di chuyển ${previewLesson?.subjectLabel ?? "lesson"}`,
      `${movePreview.fromSlotId} → ${movePreview.targetSlotId} · draft local; server sẽ revalidate`,
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
      `${lastMove.targetSlotId} → ${lastMove.fromSlotId} · draft local`,
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
        message: `Đã khóa ${newLockPlan.reduce((total, record) => total + record.lessonIds.length, 0)} lesson theo scope ${lockScope}.`,
      });
      recordManualHistory(
        "LOCK",
        "Khóa lesson",
        `${newLockPlan.length} scope · ${newLockPlan.reduce((total, record) => total + record.lessonIds.length, 0)} lesson`,
      );
      return;
    }
    if (unlockPlan.length === 0) return;
    setLockRecords((current) => current.filter((record) => !unlockPlan.some((target) => target.id === record.id)));
    setLastLockAction({ previousLocks, message: `Đã mở khóa ${unlockPlan.length} scope.` });
    recordManualHistory("UNLOCK", "Mở khóa lesson", `${unlockPlan.length} scope · draft local`);
  }

  function undoLockAction() {
    if (!lastLockAction) return;
    setLockRecords(lastLockAction.previousLocks);
    recordManualHistory("UNDO", "Hoàn tác lock", "Khôi phục trạng thái lock trước đó · draft local");
    setLastLockAction(null);
  }

  function refreshCompare() {
    setCompareResult(buildLocalCompare(lessons));
    setVersionNotice("Đã tính lại diff theo snapshot draft local; API server sẽ là nguồn chính thức.");
  }

  function cloneDraft() {
    setDraftVersionLabel("Draft v3 · clone từ Published v1");
    setVersionNotice("Đã tạo draft mới từ snapshot published; bản published vẫn immutable.");
    recordManualHistory("CLONE", "Clone phương án", "Published v1 → Draft v3 · actor local-qc-user");
  }

  function rollbackToPublished() {
    setLessons(DEMO_LESSONS);
    setLockRecords([]);
    setLastMove(null);
    setDraftVersionLabel("Draft v4 · rollback từ Published v1");
    setVersionNotice("Đã tạo draft mới từ snapshot published; không mutate bản published.");
    setCompareResult(buildLocalCompare(DEMO_LESSONS));
    recordManualHistory("ROLLBACK", "Rollback phương án", "Draft hiện tại → Published v1 · reason bắt buộc");
  }

  function transitionWorkflow(target: "APPROVED" | "PUBLISHED") {
    if (!canApprovePublish) return;
    if (target === "APPROVED" && workflowStatus !== "IN_REVIEW") return;
    if (target === "PUBLISHED" && workflowStatus !== "LOCKED") return;
    setWorkflowStatus(target);
    recordManualHistory(
      target === "APPROVED" ? "APPROVE" : "PUBLISH",
      target === "APPROVED" ? "Approval phương án" : "Publish phương án",
      `${target} · actor ${frontendConfig.actorId} · server sẽ kiểm tra gate và ghi timestamp`,
    );
  }

  async function exportWorkbook(viewToExport: "all" | TimetableView) {
    setExportingView(viewToExport);
    setExportNotice("Đang tạo workbook từ snapshot server...");
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
      setExportNotice(`Đã tải ${filename}; workbook giữ nguyên metadata version/status và đối soát snapshot.`);
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "Không thể export workbook.");
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
          <p className="eyebrow">Step 04 · Solve & review</p>
          <h1>Thời khóa biểu</h1>
          <p className="lead">Một solution, ba góc nhìn nghiệp vụ — cùng lesson, cùng slot và cùng conflict marker.</p>
        </div>
        <div className="page-header-action">
          <button className="button-secondary" type="button" onClick={() => navigateTo("imports")}>
            ← Quay lại import
          </button>
        </div>
      </div>

      <OptimizationJobPanel />

      <section className="panel timetable-shell" aria-labelledby="timetable-title">
        <div className="timetable-toolbar">
          <div>
            <p className="eyebrow">Draft workspace · demo solution</p>
            <h2 id="timetable-title">Review assignment theo resource</h2>
            <p className="small-note">
              Dữ liệu mẫu minh họa contract `SolveJobResult`; hard constraints vẫn thuộc server/solver.
            </p>
          </div>
          <span className="solve-status feasible-status">FEASIBLE · 842 ms</span>
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
            <span>Tìm trong timetable</span>
            <input
              type="search"
              value={searchQuery}
              placeholder="Môn, lớp, GV, phòng"
              aria-label="Tìm trong timetable"
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
              <option value="all">Tất cả lesson</option>
              <option value="conflict">Chỉ conflict</option>
              <option value="penalty">Có soft penalty</option>
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
            <span>Heatmap soft penalty</span>
          </label>
        </div>

        <section className="lock-panel" aria-labelledby="lock-panel-title">
          <div className="lock-panel-heading">
            <div>
              <p className="eyebrow">P2.3-T04 · Freeze scope</p>
              <h3 id="lock-panel-title">Khóa các lesson đã thống nhất</h3>
              <p className="small-note">
                Chọn lesson trên lưới rồi áp dụng scope. Lock được chuẩn bị trong solver input ở contract{" "}
                {LOCKED_ASSIGNMENTS_CONTRACT_VERSION}; server/solver vẫn là nơi kiểm tra cuối.
              </p>
            </div>
            <span className={canManageLocks ? "permission-chip write" : "permission-chip read"}>
              {canManageLocks ? "Có quyền lock" : "Chỉ đọc · cần quyền SCHEDULER/ADMIN"}
            </span>
          </div>
          <div className="lock-controls">
            <label className="lock-scope-picker">
              <span>Phạm vi lock</span>
              <select
                aria-label="Phạm vi lock"
                value={lockScope}
                onChange={(event) => setLockScope(event.target.value as LockScope)}
              >
                <option value="lesson">Lesson đã chọn</option>
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
              Chọn {selectedLessons.length} lesson đang xem
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
              Đã chọn <b>{selectedLessonIds.length}</b> · khóa mới <b>{newLockPlan.length}</b> scope · mở khóa{" "}
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
            <div className="lock-summary" aria-label="Các scope đang khóa">
              <strong>Đang khóa {lockedLessonIds.size} lesson</strong>
              <span className="lock-summary-item">
                Solver input: {solverLockInput.assignments.length} assignment · {solverLockInput.contractVersion}
              </span>
              {lockRecords.map((record) => (
                <span className="lock-summary-item" key={record.id}>
                  🔒 {record.scopeLabel} · {record.lessonIds.length} lesson
                </span>
              ))}
            </div>
          ) : (
            <p className="small-note lock-empty-note">Chưa có scope nào bị khóa trong draft local.</p>
          )}
        </section>
        {lastLockAction ? (
          <div className="alert alert-success lock-success" role="status">
            <strong>{lastLockAction.message}</strong>
            <span>Preview local; khi submit solve, backend phải xác thực lại quyền và hard constraints.</span>
            <button className="button-secondary" type="button" onClick={undoLockAction}>
              Hoàn tác lock
            </button>
          </div>
        ) : null}

        <div className="solve-summary" aria-label="Tóm tắt solution">
          <span>
            <b>{selectedEntity?.label ?? "—"}</b> · {selectedEntity?.detail ?? "Chưa chọn"}
          </span>
          <span>{visibleCount} lesson</span>
          <span>
            Workload <b>{workloadDays}/5 ngày</b>
          </span>
          <span>
            Teacher gap <b>{formatMetric(DEMO_OBJECTIVE.teacherGap)} penalty</b>
          </span>
          <span className={conflictCount > 0 ? "summary-warning" : "summary-ok"}>
            {conflictCount > 0 ? `${conflictCount} conflict cần review` : "Không có conflict"}
          </span>
          <span>Objective {formatMetric(DEMO_OBJECTIVE.weightedTotal)} · gap 0%</span>
        </div>

        <section className="quality-panel" aria-labelledby="quality-title">
          <div className="quality-heading">
            <div>
              <p className="eyebrow">Quality indicators</p>
              <h3 id="quality-title">Soft score breakdown</h3>
              <p className="small-note">
                Đồng bộ theo `diagnostics.objectiveBreakdown`; thấp hơn là tốt hơn sau khi đã đạt hard feasibility.
              </p>
            </div>
            <div className="objective-total">
              <span>Weighted total</span>
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
          <div className="heatmap-legend" aria-label="Chú thích heatmap soft penalty">
            <span>Heatmap cell</span>
            {[0, 1, 2, 3].map((level) => (
              <span className="heatmap-key" key={level}>
                <i className={`heatmap-swatch heat-level-${level}`} aria-hidden="true" />
                {level === 0 ? "0 · không phạt" : level === 3 ? "3+ · cao" : `${level} · thấp`}
              </span>
            ))}
            <span className="heatmap-legend-note">Màu luôn đi kèm nhãn Soft N để không phụ thuộc vào màu sắc.</span>
          </div>
        </section>

        <section className="version-panel" aria-labelledby="version-panel-title">
          <div className="version-heading">
            <div>
              <p className="eyebrow">P2.4-T02 · Scenario management</p>
              <h3 id="version-panel-title">Compare / clone / rollback phương án</h3>
              <p className="small-note">
                <b>{draftVersionLabel}</b> · Published v1 luôn immutable; mọi clone/rollback tạo draft mới và ghi actor,
                reason, source version ở server audit.
              </p>
            </div>
            <span className="version-contract-badge">SCHEDULE-VERSION-OPS-1.0.0</span>
          </div>
          <div className="version-actions">
            <button type="button" onClick={refreshCompare}>
              Compare snapshot
            </button>
            <button className="button-secondary" type="button" onClick={cloneDraft}>
              Clone thành draft
            </button>
            <button className="button-secondary" type="button" onClick={rollbackToPublished}>
              Rollback snapshot cũ
            </button>
          </div>
          <div className="version-notice" role="status" aria-live="polite">
            {versionNotice}
          </div>
          <div className="version-score-grid" aria-label="Score delta giữa hai phương án">
            <span>
              Thay đổi <b>{compareResult.summary.changedAssignments}</b>
            </span>
            <span>
              Move <b>{compareResult.summary.moves}</b>
            </span>
            <span>
              Add / remove{" "}
              <b>
                {compareResult.summary.additions} / {compareResult.summary.removals}
              </b>
            </span>
            <span>
              Score delta{" "}
              <b>
                {compareResult.score.delta === null
                  ? "N/A"
                  : `${compareResult.score.delta > 0 ? "+" : ""}${compareResult.score.delta}`}
              </b>
            </span>
          </div>
          {compareResult.diffs.length > 0 ? (
            <ol className="version-diff-list" aria-label="Bản chênh lệch phương án">
              {compareResult.diffs.map((diff) => (
                <li key={`${diff.lessonId}-${diff.sessionIndex}`} className="version-diff-item">
                  <span className={`diff-operation diff-operation-${diff.operation.toLowerCase()}`}>
                    {diff.operation}
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
            <p className="small-note version-empty">Hai snapshot không có thay đổi assignment.</p>
          )}
        </section>

        <section className="workflow-panel" aria-labelledby="workflow-panel-title">
          <div className="workflow-heading">
            <div>
              <p className="eyebrow">P2.4-T03 · Approval gate</p>
              <h3 id="workflow-panel-title">Approval và publish permissions</h3>
              <p className="small-note">
                Role hiện tại: <b>{frontendConfig.actorRole}</b> · chỉ ADMIN/REVIEWER được approval hoặc publish; API
                vẫn kiểm tra hard gate và ghi audit timestamp.
              </p>
            </div>
            <span className={`workflow-status workflow-status-${workflowStatus.toLowerCase()}`}>{workflowStatus}</span>
          </div>
          <div className="workflow-actions">
            <button
              type="button"
              onClick={() => transitionWorkflow("APPROVED")}
              disabled={!canApprovePublish || workflowStatus !== "IN_REVIEW"}
            >
              Approve phương án
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => transitionWorkflow("PUBLISHED")}
              disabled={!canApprovePublish || workflowStatus !== "LOCKED"}
            >
              Publish phương án
            </button>
          </div>
          <p className="small-note workflow-note">
            Preview local chỉ mô phỏng state; scheduler không thể tự approve. Publish thật chỉ thành công sau
            completeness, scope và hard class/teacher/room gate ở NestJS/PostgreSQL.
          </p>
        </section>

        <section className="export-panel" aria-labelledby="export-panel-title">
          <div className="export-heading">
            <div>
              <p className="eyebrow">P2.4-T04 · Official workbook</p>
              <h3 id="export-panel-title">Xuất Excel theo lớp, giáo viên và phòng</h3>
              <p className="small-note">
                Server export từ version <b>{frontendConfig.scheduleVersionId}</b>; UI chỉ khởi chạy request, không thay
                thế permission hoặc hard-constraint gate.
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
              <p className="eyebrow">Eligibility preview</p>
              <h3>
                {movePreview.eligible ? "Có thể chuyển" : "Không thể chuyển"} {previewLesson.subjectLabel} →{" "}
                {previewTargetSlot.dayLabel} · Tiết {previewTargetSlot.period}
              </h3>
              <p>{movePreview.reason}</p>
              <small>
                Soft penalty delta:{" "}
                <b>
                  {movePreview.softPenaltyDelta > 0 ? "+" : ""}
                  {movePreview.softPenaltyDelta}
                </b>{" "}
                · hard constraints phải được server xác nhận lại.
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
            <strong>Đã cập nhật vị trí lesson trong draft local.</strong>
            <span>Chưa gửi persistence; server sẽ revalidate trước khi ghi.</span>
            <button className="button-secondary" type="button" onClick={handleUndoMove}>
              Hoàn tác
            </button>
          </div>
        ) : null}

        <section className="history-panel" aria-labelledby="history-panel-title">
          <div className="history-heading">
            <div>
              <p className="eyebrow">P2.3-T06 · Audit trail</p>
              <h3 id="history-panel-title">Lịch sử chỉnh tay</h3>
              <p className="small-note">
                Phiên local chỉ hiển thị metadata an toàn của move/lock/undo; audit server là nguồn khớp DB và có
                correlation ID.
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
                  <span className={`history-kind history-kind-${entry.kind.toLowerCase()}`}>{entry.kind}</span>
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
            <i className="legend-dot conflict-dot" aria-hidden="true" /> Conflict cần review
          </span>
          <span className="legend-note">
            Kéo lesson hoặc focus card + dùng phím mũi tên để xem eligibility preview.
          </span>
          <span className="legend-note">Timezone: Asia/Ho_Chi_Minh · tuần pilot</span>
        </div>
      </section>
    </>
  );
}

export type { TimetableState, TimetableView };
