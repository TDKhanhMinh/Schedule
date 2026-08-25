export const SCHEDULE_EXPORT_CONTRACT_VERSION = "SCHEDULE-EXPORT-1.0.0" as const;

export const SCHEDULE_EXPORT_VIEWS = ["all", "class", "teacher", "room"] as const;
export type ScheduleExportView = (typeof SCHEDULE_EXPORT_VIEWS)[number];

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
