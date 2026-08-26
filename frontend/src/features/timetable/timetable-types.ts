export type TimetableView = "school" | "class" | "teacher" | "room";
export type TimetableState = "loading" | "ready" | "empty" | "error";

export interface ScheduleVersionSnapshot {
  id: string;
  schoolId: string;
  academicPeriodId: string;
  revision: number;
  etag: string;
  status: string;
  assignments: Array<{ id: string; lessonId: string; sessionIndex: number; timeSlotId: string; roomId: string | null }>;
}

export interface MasterRecord {
  id: string;
  code?: string;
  name?: string;
  displayName?: string;
}

export interface TimeSlot {
  id: string;
  day: number;
  period: number;
  shiftCode?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface LessonRequirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string | null;
  requiredSessions: number;
}

export interface TimetableAssignment {
  id: string;
  lessonId: string;
  sessionIndex: number;
  timeSlotId: string;
  roomId: string | null;
  classLabel: string;
  subjectLabel: string;
  teacherLabel: string;
  roomLabel: string;
  shiftCode: string | null;
  day: number | null;
  period: number | null;
  timeLabel: string;
}

export interface TimetableHistoryEntry {
  id: string;
  action?: string;
  actorId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}
