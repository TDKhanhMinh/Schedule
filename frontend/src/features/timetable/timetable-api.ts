import { frontendConfig } from "../../config";
import { apiRequest } from "../../lib/api-client";
import type {
  LessonRequirement,
  MasterRecord,
  ScheduleVersionSnapshot,
  TimeSlot,
  TimetableAssignment,
  TimetableHistoryEntry,
} from "./timetable-types";

async function getJson<T>(path: string, signal?: AbortSignal) {
  return apiRequest<T>(path, { signal });
}

function label(record: MasterRecord | undefined, fallback: string) {
  if (!record) return fallback;
  return record.code && record.name
    ? `${record.code} · ${record.name}`
    : (record.displayName ?? record.name ?? record.code ?? record.id);
}

export async function loadTimetable(signal?: AbortSignal) {
  if (!frontendConfig.schoolId || !frontendConfig.scheduleVersionId) return null;
  const snapshot = await getJson<ScheduleVersionSnapshot>(
    `/schools/${frontendConfig.schoolId}/schedule-versions/${frontendConfig.scheduleVersionId}`,
    signal,
  );
  const base = `/schools/${frontendConfig.schoolId}`;
  const [periodSlots, lessonRequirements, classes, subjects, teachers, rooms, history] = await Promise.all([
    getJson<TimeSlot[]>(`${base}/academic-periods/${snapshot.academicPeriodId}/time-slots`, signal),
    getJson<LessonRequirement[]>(`${base}/academic-periods/${snapshot.academicPeriodId}/lesson-requirements`, signal),
    getJson<MasterRecord[]>(`${base}/classes`, signal),
    getJson<MasterRecord[]>(`${base}/subjects`, signal),
    getJson<MasterRecord[]>(`${base}/teachers`, signal),
    getJson<MasterRecord[]>(`${base}/rooms`, signal),
    getJson<TimetableHistoryEntry[]>(`${base}/schedule-versions/${snapshot.id}/history?limit=20`, signal),
  ]);
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const subjectMap = new Map(subjects.map((item) => [item.id, item]));
  const teacherMap = new Map(teachers.map((item) => [item.id, item]));
  const roomMap = new Map(rooms.map((item) => [item.id, item]));
  const slotMap = new Map(periodSlots.map((item) => [item.id, item]));
  const lessonMap = new Map(lessonRequirements.map((item) => [item.id, item]));
  const assignments: TimetableAssignment[] = snapshot.assignments.map((assignment) => {
    const lesson = lessonMap.get(assignment.lessonId);
    const slot = slotMap.get(assignment.timeSlotId);
    return {
      ...assignment,
      classLabel: label(lesson ? classMap.get(lesson.classId) : undefined, lesson?.classId ?? "Lớp chưa xác định"),
      subjectLabel: label(
        lesson ? subjectMap.get(lesson.subjectId) : undefined,
        lesson?.subjectId ?? "Môn chưa xác định",
      ),
      teacherLabel: label(
        lesson ? teacherMap.get(lesson.teacherId) : undefined,
        lesson?.teacherId ?? "Giáo viên chưa xác định",
      ),
      roomLabel: assignment.roomId ? label(roomMap.get(assignment.roomId), assignment.roomId) : "Chưa chỉ định phòng",
      shiftCode: slot?.shiftCode ?? null,
      day: slot?.day ?? null,
      period: slot?.period ?? null,
      timeLabel: slot?.startsAt && slot.endsAt ? `${slot.startsAt}–${slot.endsAt}` : "—",
    };
  });
  return {
    snapshot,
    assignments,
    history,
    timeSlots: periodSlots,
    classLabels: classes.map((item) => label(item, item.id)),
  };
}
