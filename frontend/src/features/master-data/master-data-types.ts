export type Status = "ACTIVE" | "ARCHIVED";
export type MasterDataEntity = "school" | "period" | "slot" | "teacher" | "class" | "subject" | "room" | "assignment";

export interface School {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: Status;
}

export interface AcademicPeriod {
  id: string;
  academicYear: string;
  termCode: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export interface TimeSlot {
  id: string;
  day: number;
  period: number;
  shiftCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface Teacher {
  id: string;
  code: string;
  displayName: string;
  status: Status;
}

export interface SchoolClass {
  id: string;
  code: string;
  name: string;
  grade: number;
  status: Status;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  status: Status;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  roomType: string | null;
  capacity: number | null;
  status: Status;
}

export interface LessonRequirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  requiredSessions: number;
  status: Status;
}

export type MasterRecord =
  School | AcademicPeriod | TimeSlot | Teacher | SchoolClass | Subject | Room | LessonRequirement;

export interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  [key: string]: unknown;
}

export class MasterDataApiError extends Error {
  payload: ApiErrorPayload;

  constructor(payload: ApiErrorPayload, fallback: string) {
    const message = Array.isArray(payload.message) ? payload.message.join(", ") : payload.message;
    super(typeof message === "string" ? message : fallback);
    this.name = "MasterDataApiError";
    this.payload = payload;
  }
}
