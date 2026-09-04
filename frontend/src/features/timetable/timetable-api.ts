import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";
import type { SolveJobRequest } from "@schedule/backend/contracts";
import type {
  LessonRequirement,
  HomeroomAssignment,
  GradeShiftConfig,
  MasterRecord,
  ScheduleVersionSnapshot,
  TimeSlot,
  TimetableAssignment,
  TimetableHistoryEntry,
} from "./timetable-types";

async function getJson<T>(path: string, signal?: AbortSignal) {
  return apiRequest<T>(path, { signal });
}

export type TimetableSolveInput = Omit<SolveJobRequest, "jobId"> & { academicPeriodId: string };

type TimetableAssignmentInput = {
  id?: string;
  lessonId: string;
  sessionIndex: number;
  timeSlotId?: string;
  slotId?: string;
  roomId?: string | null;
};

export interface TimetableSourceData {
  lessonRequirements: LessonRequirement[];
  timeSlots: TimeSlot[];
  classes: MasterRecord[];
  subjects: MasterRecord[];
  teachers: MasterRecord[];
  rooms: MasterRecord[];
}

export interface TimetableLoadedData extends TimetableSourceData {
  snapshot: ScheduleVersionSnapshot;
  assignments: TimetableAssignment[];
  history: TimetableHistoryEntry[];
  classLabels: string[];
  homerooms: HomeroomAssignment[];
  gradeShiftConfigs: GradeShiftConfig[];
}

export interface TimetableLoadContext {
  schoolId: string;
  academicPeriodId: string;
  scheduleVersionId: string;
}

function label(record: MasterRecord | undefined, fallback: string) {
  if (!record) return fallback;
  return record.code && record.name
    ? `${record.code} · ${record.name}`
    : (record.displayName ?? record.name ?? record.code ?? record.id);
}

export async function loadTimetable(signal?: AbortSignal, context?: TimetableLoadContext) {
  const schoolId = context?.schoolId ?? frontendConfig.schoolId;
  const scheduleVersionId = context?.scheduleVersionId ?? frontendConfig.scheduleVersionId;
  const academicPeriodId = context?.academicPeriodId;
  if (!schoolId || !scheduleVersionId) return null;
  const snapshot = await getJson<ScheduleVersionSnapshot>(
    `/schools/${schoolId}/schedule-versions/${scheduleVersionId}`,
    signal,
  );
  if (academicPeriodId && snapshot.academicPeriodId !== academicPeriodId) {
    throw new Error("Phiên bản thời khóa biểu không thuộc năm học đang chọn.");
  }
  const base = `/schools/${schoolId}`;
  const [periodSlots, lessonRequirements, classes, subjects, teachers, rooms, history, homerooms, gradeShiftConfigs] =
    await Promise.all([
      getJson<TimeSlot[]>(`${base}/academic-periods/${snapshot.academicPeriodId}/time-slots`, signal),
      getJson<LessonRequirement[]>(`${base}/academic-periods/${snapshot.academicPeriodId}/lesson-requirements`, signal),
      getJson<MasterRecord[]>(`${base}/classes`, signal),
      getJson<MasterRecord[]>(`${base}/subjects`, signal),
      getJson<MasterRecord[]>(`${base}/teachers`, signal),
      getJson<MasterRecord[]>(`${base}/rooms`, signal),
      getJson<TimetableHistoryEntry[]>(`${base}/schedule-versions/${snapshot.id}/history?limit=20`, signal),
      getJson<HomeroomAssignment[]>(
        `${base}/academic-periods/${snapshot.academicPeriodId}/homeroom-assignments`,
        signal,
      ),
      getJson<GradeShiftConfig[]>(`${base}/academic-periods/${snapshot.academicPeriodId}/grade-shifts`, signal),
    ]);
  const assignments = buildTimetableAssignments(snapshot.assignments, {
    lessonRequirements,
    timeSlots: periodSlots,
    classes,
    subjects,
    teachers,
    rooms,
  });
  return {
    snapshot,
    assignments,
    history,
    timeSlots: periodSlots,
    lessonRequirements,
    classes,
    subjects,
    teachers,
    rooms,
    classLabels: classes.map((item) => label(item, item.id)),
    homerooms,
    gradeShiftConfigs,
  } satisfies TimetableLoadedData;
}

export function buildTimetableAssignments(
  rawAssignments: TimetableAssignmentInput[],
  source: TimetableSourceData,
): TimetableAssignment[] {
  const classMap = new Map(source.classes.map((item) => [item.id, item]));
  const subjectMap = new Map(source.subjects.map((item) => [item.id, item]));
  const teacherMap = new Map(source.teachers.map((item) => [item.id, item]));
  const roomMap = new Map(source.rooms.map((item) => [item.id, item]));
  const slotMap = new Map(source.timeSlots.map((item) => [item.id, item]));
  const lessonMap = new Map(source.lessonRequirements.map((item) => [item.id, item]));

  return rawAssignments.flatMap((assignment) => {
    const timeSlotId = assignment.timeSlotId ?? assignment.slotId;
    if (!timeSlotId) return [];
    const lesson = lessonMap.get(assignment.lessonId);
    const slot = slotMap.get(timeSlotId);
    if (!lesson || !slot) return [];
    const subject = subjectMap.get(lesson.subjectId);
    return [
      {
        id: assignment.id ?? `solver-${assignment.lessonId}-${assignment.sessionIndex}-${timeSlotId}`,
        lessonId: assignment.lessonId,
        sessionIndex: assignment.sessionIndex,
        timeSlotId,
        roomId: assignment.roomId ?? null,
        classLabel: label(classMap.get(lesson.classId), lesson.classId ?? "Lớp chưa xác định"),
        subjectLabel: subject?.code ?? subject?.name ?? lesson.subjectId ?? "Môn chưa xác định",
        subjectName: subject?.name ?? lesson.subjectId ?? "Môn chưa xác định",
        activityType: lesson.activityType,
        teacherLabel: label(teacherMap.get(lesson.teacherId), lesson.teacherId ?? "Giáo viên chưa xác định"),
        roomLabel: assignment.roomId ? label(roomMap.get(assignment.roomId), assignment.roomId) : "Chưa chỉ định phòng",
        shiftCode: slot.shiftCode ?? "MORNING",
        day: slot.day,
        period: slot.period,
        timeLabel: slot.startsAt && slot.endsAt ? `${slot.startsAt} - ${slot.endsAt}` : "Chưa có",
      },
    ];
  });
}
