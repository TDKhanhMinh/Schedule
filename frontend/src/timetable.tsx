import { useMemo, useState } from "react";
import type { ObjectiveBreakdown } from "@schedule/backend/contracts";
import { navigateTo } from "./routing";

type TimetableView = "class" | "teacher" | "room";
type TimetableState = "loading" | "ready" | "empty" | "error";

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

function readInitialState(): TimetableState {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "loading" || state === "empty" || state === "error" ? state : "ready";
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyboardMove,
}: {
  view: TimetableView;
  selectedEntityId: string;
  lessons: TimetableLesson[];
  heatmapEnabled: boolean;
  preview: MovePreview | null;
  draggedLessonId: string | null;
  onDragStart: (lessonId: string) => void;
  onDragEnd: () => void;
  onDragOver: (targetSlotId: string) => void;
  onDrop: (targetSlotId: string) => void;
  onKeyboardMove: (lessonId: string, direction: MoveDirection) => void;
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
                            className={`lesson-card ${lesson.status === "CONFLICT" ? "conflict-card" : ""} ${draggedLessonId === lesson.id ? "dragging-card" : ""}`}
                            draggable
                            tabIndex={0}
                            aria-label={`${lesson.subjectLabel} · ${formatViewSubject(lesson, view)}. Dùng phím mũi tên để đề xuất chuyển slot.`}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", lesson.id);
                              onDragStart(lesson.id);
                            }}
                            onDragEnd={onDragEnd}
                            onKeyDown={(event) => {
                              if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                              event.preventDefault();
                              onKeyboardMove(lesson.id, event.key as MoveDirection);
                            }}
                            key={lesson.id}
                          >
                            <div className="lesson-card-topline">
                              <strong>{lesson.subjectLabel}</strong>
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
  const visibleCount = selectedLessons.length;
  const conflictCount = selectedLessons.filter((lesson) => lesson.status === "CONFLICT").length;
  const workloadDays = new Set(selectedLessons.map((lesson) => SLOTS.find((slot) => slot.id === lesson.slotId)?.day))
    .size;

  function previewMove(lessonId: string, targetSlotId: string) {
    setMovePreview(createMovePreview(lessonId, targetSlotId, lessons));
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
    setMovePreview(null);
  }

  function handleUndoMove() {
    if (!lastMove) return;
    setLessons((currentLessons) =>
      currentLessons.map((lesson) =>
        lesson.id === lastMove.lessonId ? { ...lesson, slotId: lastMove.fromSlotId } : lesson,
      ),
    );
    setLastMove(null);
  }

  function handleKeyboardMove(lessonId: string, direction: MoveDirection) {
    const preview = moveTargetByKeyboard(lessonId, direction, lessons);
    if (preview) setMovePreview(preview);
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

        {state === "ready" ? (
          <TimetableGrid
            view={view}
            selectedEntityId={selectedId}
            lessons={filteredLessons}
            heatmapEnabled={heatmapEnabled}
            preview={movePreview}
            draggedLessonId={draggedLessonId}
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
