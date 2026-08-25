export const SCHEDULE_EXPORT_CONTRACT_VERSION = "SCHEDULE-EXPORT-1.0.0" as const;

export const SCHEDULE_PUBLIC_LINK_CONTRACT_VERSION = "SCHEDULE-PUBLIC-LINK-1.0.0" as const;
export const SCHEDULE_PUBLIC_VIEW_CONTRACT_VERSION = "SCHEDULE-PUBLIC-VIEW-1.0.0" as const;
export const SCHEDULE_PDF_CONTRACT_VERSION = "SCHEDULE-PDF-1.0.0" as const;

export const SCHEDULE_EXPORT_VIEWS = ["all", "class", "teacher", "room"] as const;
export type ScheduleExportView = (typeof SCHEDULE_EXPORT_VIEWS)[number];

export const SCHEDULE_PUBLIC_VIEWS = ["all", "class", "teacher", "room"] as const;
export type SchedulePublicView = (typeof SCHEDULE_PUBLIC_VIEWS)[number];

export interface ScheduleExportSheetSummary {
  sheet: string;
  view: Exclude<ScheduleExportView, "all">;
  assignmentCount: number;
}

export interface ScheduleExportMetadata {
  contractVersion: typeof SCHEDULE_EXPORT_CONTRACT_VERSION;
  school: { id: string; code: string; name: string };
  academicPeriod: { id: string; name: string; academicYear: string; termCode: string };
  scheduleVersion: { id: string; number: number; status: string; revision: number };
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  view: ScheduleExportView;
  snapshotAssignmentCount: number;
  requiredLessonSessions: number;
  snapshotReconciles: boolean;
  hardConstraintCheck: "PASSED";
  sheets: ScheduleExportSheetSummary[];
}

export interface PublicScheduleAssignment {
  classCode: string;
  className: string;
  teacherCode: string;
  teacherName: string;
  subjectCode: string;
  subjectName: string;
  roomCode: string | null;
  roomName: string | null;
  day: number;
  period: number;
  shiftCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface PublicScheduleViewResult {
  contractVersion: typeof SCHEDULE_PUBLIC_VIEW_CONTRACT_VERSION;
  pdfContractVersion: typeof SCHEDULE_PDF_CONTRACT_VERSION;
  watermark: "PUBLIC READ ONLY";
  linkExpiresAt: string;
  generatedAt: string;
  view: SchedulePublicView;
  resourceFilter: string | null;
  school: { id: string; code: string; name: string };
  academicPeriod: { id: string; name: string; academicYear: string; termCode: string };
  scheduleVersion: { id: string; number: number; status: "PUBLISHED"; revision: number };
  resources: { classes: string[]; teachers: string[]; rooms: string[] };
  assignments: PublicScheduleAssignment[];
}
