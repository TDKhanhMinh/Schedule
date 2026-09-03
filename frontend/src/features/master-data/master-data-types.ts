export type Status = "ACTIVE" | "ARCHIVED";
export type MasterDataEntity = "school" | "period" | "slot" | "teacher" | "class" | "subject" | "room" | "assignment";
export type ShiftCode = "MORNING" | "AFTERNOON";

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

export interface GradeShiftConfig {
  id: string;
  schoolId: string;
  academicPeriodId: string;
  grade: number;
  mainShiftCode: ShiftCode;
  secondaryShiftCode: ShiftCode;
  allowSecondary: boolean;
  flagCeremony: {
    day: number;
    shiftCode: ShiftCode;
    period: number;
  };
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
  fixedSlotId?: string | null;
  activityType?: "LESSON" | "FLAG_CEREMONY";
  status: Status;
}

export type RuleKind = "HARD" | "SOFT";
export type RuleApprovalState = "PENDING_STAKEHOLDER" | "APPROVED" | "REVOKED";
export type RuleCatalogStatus = "SUPPORTED" | "PLANNED";

export interface RuleCatalogParameter {
  key: string;
  label: string;
  type:
    | "BOOLEAN"
    | "DAY_OF_WEEK"
    | "DAY_OF_WEEK_LIST"
    | "GRANULARITY"
    | "INTEGER"
    | "PERIOD"
    | "SHIFT_CODE"
    | "SLOT_ID"
    | "TEXT";
  required: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  options?: string[];
}

export interface RuleCatalogEntry {
  code: string;
  codePrefixes?: string[];
  name: string;
  group: "TEACHER" | "CLASS" | "SUBJECT" | "ROOM" | "SCHEDULE";
  targetResources: Array<"SCHOOL" | "TEACHER" | "CLASS" | "SUBJECT" | "ROOM">;
  supportedKinds: RuleKind[];
  defaultKind: RuleKind;
  defaultWeight?: number;
  implementationStatus: RuleCatalogStatus;
  handlerKey: string;
  description: string;
  parameters: RuleCatalogParameter[];
}

export interface RuleScope {
  schoolId?: string;
  academicPeriodId?: string;
  schoolLevel?: "THCS" | "THPT" | "THCS_THPT";
  actorType?: "SYSTEM" | "SCHOOL" | "TEACHER";
  actorId?: string;
  resourceType?: "SCHOOL" | "TEACHER" | "CLASS" | "SUBJECT" | "ROOM";
  resourceIds?: string[];
}

export interface RuleDefinition {
  id: string;
  ruleProfileId: string;
  code: string;
  kind: RuleKind;
  weight: number | null;
  sourceUrl: string;
  sourceLocator: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  scope: RuleScope;
  approvalState: RuleApprovalState;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RuleProfile {
  id: string;
  tenantId: string;
  schoolId: string;
  academicPeriodId: string;
  version: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  registerVersion: string;
  sourceUrl: string | null;
  sourceLocator: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  scope: RuleScope;
  approvalState: RuleApprovalState;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  rules: RuleDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleSnapshot {
  snapshotId: string;
  ruleSetVersion: string;
  profileVersion: string;
  registerVersion: string;
  sourceUrl: string;
  sourceLocator?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  scope: RuleScope;
  approvalState: RuleApprovalState;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  rules: Array<Omit<RuleDefinition, "id" | "ruleProfileId" | "createdAt" | "updatedAt">>;
  snapshotHash: string;
  capturedAt: string;
  capturedBy: string;
}

export interface RuleCatalogResponse {
  catalogVersion: string;
  schemaVersion: string;
  ruleTypes: RuleCatalogEntry[];
}

export interface RuleValidationResult {
  profileId: string;
  profileVersion: string;
  valid: boolean;
  canCreateSnapshot: boolean;
  counts: { total: number; hard: number; soft: number; supported: number };
  issues: Array<{ code: string; severity: "ERROR" | "WARNING"; ruleId?: string; ruleCode?: string; message: string }>;
}

export interface RuleSnapshotResolution {
  schoolId: string;
  academicPeriodId: string;
  effectiveAsOf: string;
  resolved: boolean;
  reason?: string;
  snapshot?: RuleSnapshot;
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
