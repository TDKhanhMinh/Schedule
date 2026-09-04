import { createHash } from "node:crypto";

export const TEACHER_ASSIGNMENT_CONTRACT_VERSION = "TEACHER-ASSIGNMENT-1.0.0" as const;
export const TEACHER_ASSIGNMENT_QUEUE = "teacher-assignment" as const;
export const TEACHER_ASSIGNMENT_JOB_NAME = "teacher-assignment.solve" as const;
export const TEACHER_ASSIGNMENT_QUEUE_CONTRACT_VERSION = "TEACHER-ASSIGNMENT-QUEUE-1.0.0" as const;
export const TEACHER_ASSIGNMENT_ALGORITHM_VERSION = "TEACHER-ASSIGNMENT-1.0.0" as const;
export const DEFAULT_TEACHER_ASSIGNMENT_TIME_LIMIT_SECONDS = 120;

export type TeacherAssignmentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "OPTIMAL"
  | "FEASIBLE"
  | "PROPOSED"
  | "PARTIAL"
  | "INFEASIBLE"
  | "UNKNOWN"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type TeacherAssignmentRunStage = "QUEUED" | "RUNNING" | "PERSISTING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type TeacherAssignmentProposalStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "UNASSIGNED";

export interface TeacherAssignmentDemand {
  id: string;
  schoolId: string;
  academicPeriodId: string;
  classId: string;
  classCode: string;
  className: string;
  grade: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  roomId?: string | null;
  fixedSlotId?: string | null;
  requiredSessions: number;
  activityType: "LESSON" | "FLAG_CEREMONY";
  status: "ACTIVE" | "ARCHIVED";
  currentTeacherId?: string | null;
  currentTeacherCode?: string | null;
  currentTeacherName?: string | null;
  currentAssignmentSource?: "MANUAL" | "AUTO" | null;
  currentAssignmentLocked: boolean;
  revision: number;
}

export interface TeacherAssignmentTeacher {
  id: string;
  code: string;
  name: string;
  assignedWeeklySessions: number;
  adjustedWeeklyTarget: number;
  hardWeeklyLimitSessions: number | null;
}

export interface TeacherAssignmentEligibility {
  teacherId: string;
  subjectId: string;
  grade: number;
}

export interface TeacherAssignmentManualAssignment {
  demandId: string;
  teacherId: string;
  requiredSessions: number;
  locked: boolean;
}

export interface TeacherAssignmentOptions {
  timeLimitSeconds?: number | null;
}

export interface TeacherAssignmentSolveRequest {
  contractVersion: typeof TEACHER_ASSIGNMENT_CONTRACT_VERSION;
  algorithmVersion: typeof TEACHER_ASSIGNMENT_ALGORITHM_VERSION;
  jobId: string;
  schoolId: string;
  academicPeriodId: string;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
  randomSeed: number;
  options: TeacherAssignmentOptions;
  demands: Array<
    Pick<
      TeacherAssignmentDemand,
      "id" | "classId" | "grade" | "subjectId" | "requiredSessions" | "roomId" | "fixedSlotId" | "activityType"
    >
  >;
  teachers: TeacherAssignmentTeacher[];
  eligibility: TeacherAssignmentEligibility[];
  manualAssignments: TeacherAssignmentManualAssignment[];
}

export interface TeacherAssignmentProposal {
  demandId: string;
  teacherId: string | null;
  requiredSessions: number;
  source: "AUTO" | "MANUAL";
  isLocked: boolean;
  status: TeacherAssignmentProposalStatus;
  score: number | null;
  reasonCode: string | null;
  reason: string | null;
  loadBefore: number | null;
  loadAfter: number | null;
  adjustedTarget: number | null;
}

export interface TeacherAssignmentPreflightIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  demandId?: string;
  teacherId?: string;
  message: string;
}

export interface TeacherAssignmentPreflightReport {
  contractVersion: typeof TEACHER_ASSIGNMENT_CONTRACT_VERSION;
  canRun: boolean;
  totalDemandCount: number;
  lockedAssignmentCount: number;
  candidatePairCount: number;
  demandsWithoutCandidate: string[];
  issues: TeacherAssignmentPreflightIssue[];
  warnings: string[];
}

export interface TeacherAssignmentDiagnostics {
  warnings: string[];
  conflicts: string[];
  unassignedDemandIds: string[];
  modelMetrics: {
    variableCount: number;
    candidatePairCount: number;
    unassignedVariableCount: number;
  };
  runMetrics: {
    wallTimeMs: number;
  };
}

export interface TeacherAssignmentMetadata {
  solverVersion: string;
  contractVersion: typeof TEACHER_ASSIGNMENT_CONTRACT_VERSION;
  algorithmVersion: typeof TEACHER_ASSIGNMENT_ALGORITHM_VERSION;
  randomSeed: number;
  timeLimitSeconds: number | null;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
}

export interface TeacherAssignmentSolveResult {
  contractVersion: typeof TEACHER_ASSIGNMENT_CONTRACT_VERSION;
  jobId: string;
  status: "OPTIMAL" | "FEASIBLE" | "PARTIAL" | "INFEASIBLE" | "UNKNOWN";
  proposals: TeacherAssignmentProposal[];
  diagnostics: TeacherAssignmentDiagnostics;
  metadata: TeacherAssignmentMetadata;
}

export interface TeacherAssignmentJobData {
  queueContractVersion: typeof TEACHER_ASSIGNMENT_QUEUE_CONTRACT_VERSION;
  runId: string;
  request: TeacherAssignmentSolveRequest;
  inputChecksum: string;
  maxAttempts: number;
  traceId?: string;
  tenantId?: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function computeTeacherAssignmentChecksum(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}
