export const SCHEDULE_EDIT_CONTRACT_VERSION = "SCHEDULE-EDIT-1.0.0" as const;

export interface ScheduleAssignmentSnapshot {
  id: string;
  lessonId: string;
  sessionIndex: number;
  timeSlotId: string;
  roomId: string | null;
}

export interface ScheduleVersionSnapshot {
  contractVersion: typeof SCHEDULE_EDIT_CONTRACT_VERSION;
  id: string;
  schoolId: string;
  academicPeriodId: string;
  revision: number;
  etag: string;
  status: string;
  assignments: ScheduleAssignmentSnapshot[];
}
