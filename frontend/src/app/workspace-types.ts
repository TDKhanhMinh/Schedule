export type WorkspaceScheduleVersionStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "LOCKED" | "PUBLISHED" | "ARCHIVED";

export interface WorkspaceScheduleVersion {
  id: string;
  schoolId: string;
  academicPeriodId: string;
  versionNumber: number;
  status: WorkspaceScheduleVersionStatus;
  sourceRunId: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  revision: number;
  etag: string;
  createdAt: string;
  updatedAt: string;
}
