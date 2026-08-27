import type { TeacherAvailabilitySet } from "./teacher-availability";
import type { PreSolveReport, RoomCapability } from "./pre-solve";

export const CONTRACT_VERSION = "1.0" as const;
export const SOLVER_OBJECTIVE_CONTRACT_VERSION = "SOLVER-OBJECTIVE-1.0.0" as const;
export const LOCKED_ASSIGNMENTS_CONTRACT_VERSION = "LOCKED-ASSIGNMENTS-1.0.0" as const;
export const LOCAL_REPAIR_CONTRACT_VERSION = "LOCAL-REPAIR-1.0.0" as const;
export const RELAXATION_CONTRACT_VERSION = "RELAXATION-PROPOSAL-1.0.0" as const;
export const SCHEDULE_VERSION_OPERATIONS_CONTRACT_VERSION = "SCHEDULE-VERSION-OPS-1.0.0" as const;
export const FREEZE_SCOPE_CONTRACT_VERSION = "FREEZE-SCOPE-1.0.0" as const;
export const OPTIMIZATION_QUEUE = "optimization" as const;
export const OPTIMIZATION_JOB_NAME = "optimization.solve" as const;

export * from "./rule-set";
export * from "./conflict-catalog";
export * from "./pre-solve";
export * from "./solver-adapter";
export * from "./teacher-availability";
export * from "./teacher-load";
export * from "./schedule-export";
export * from "./master-data-import";

export type SolveStatus = "INVALID" | "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";

export interface TimeSlot {
  id: string;
  day: number;
  period: number;
  shiftCode?: string;
}

export interface LessonRequirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  requiredSessions: number;
  allowedSlotIds?: string[];
  fixedSlotId?: string;
  allowedRoomIds?: string[];
  requiredRoomCapabilities?: string[];
}

export type TeacherSubjectGradeEnforcement = "OFF" | "WARNING" | "HARD";

export interface TeacherSubjectGradeAssignment {
  teacherId: string;
  subjectId: string;
  grade: number;
}

export interface SolveJobOptions {
  timeLimitSeconds?: number;
}

export type LockScope = "LESSON" | "TEACHER" | "DAY";

export interface LockedAssignment {
  lessonId: string;
  sessionIndex: number;
  slotId: string;
  roomId?: string | null;
  scope: LockScope;
  scopeId: string;
}

export interface LockedAssignments {
  contractVersion: typeof LOCKED_ASSIGNMENTS_CONTRACT_VERSION;
  assignments: LockedAssignment[];
}

export interface LocalRepairRequest {
  contractVersion: typeof LOCAL_REPAIR_CONTRACT_VERSION;
  baselineSnapshotHash: string;
  baselineAssignments: Assignment[];
  affectedAssignmentKeys: string[];
  frozenAssignmentKeys?: string[];
}

export interface SolverObjectiveWeights {
  teacherGap: number;
  compactness: number;
  dayDistribution: number;
  undesirableSlots: number;
  preferredDays: number;
  fairness: number;
}

export interface SolverObjective {
  contractVersion: typeof SOLVER_OBJECTIVE_CONTRACT_VERSION;
  weights: SolverObjectiveWeights;
}

export interface SolveJobRequest {
  schemaVersion: typeof CONTRACT_VERSION;
  jobId: string;
  schoolId: string;
  ruleSnapshotId?: string;
  ruleSetVersion?: string;
  ruleSnapshotHash?: string;
  timeSlots: TimeSlot[];
  lessons: LessonRequirement[];
  teacherAvailability?: TeacherAvailabilitySet;
  classUnavailableSlotIds?: Record<string, string[]>;
  classGrades?: Record<string, number>;
  teacherSubjectGradeAssignments?: TeacherSubjectGradeAssignment[];
  teacherSubjectGradeEnforcement?: TeacherSubjectGradeEnforcement;
  rooms?: RoomCapability[];
  lockedAssignments?: LockedAssignments;
  localRepair?: LocalRepairRequest;
  options?: SolveJobOptions;
  objective?: SolverObjective;
}

export interface Assignment {
  lessonId: string;
  sessionIndex: number;
  slotId: string;
  roomId?: string | null;
}

export interface SolverModelMetrics {
  variableCount: number;
  candidatePairCount: number;
  domainPrunedCount: number;
  roomDomainCount: number;
}

export interface ObjectiveBreakdown {
  teacherGap: number;
  compactness: number;
  dayDistribution: number;
  undesirableSlots: number;
  preferredDays: number;
  fairness: number;
  weightedTotal: number;
}

export interface SolverRunMetrics {
  wallTimeMs: number;
  bestObjectiveBound: number | null;
  objectiveGapPercent: number | null;
}

export interface LocalRepairDiagnostics {
  contractVersion: typeof LOCAL_REPAIR_CONTRACT_VERSION;
  baselineSnapshotHash: string;
  affectedAssignmentKeys: string[];
  frozenAssignmentKeys: string[];
  movedAssignmentCount: number;
  preservedAssignmentCount: number;
  outsideScopeUnchanged: boolean;
}

export interface RelaxationProposal {
  proposalId: string;
  rank: number;
  kind: "SOFT_RULE_WEIGHT" | "STAKEHOLDER_DATA_CHANGE" | "STAKEHOLDER_HARD_RULE_REVIEW";
  targetCode: string;
  priorityScore: number;
  affectedLessonCount: number;
  affectedEntityIds: string[];
  ruleSource: Record<string, string>;
  impact: string;
  requiresApproval: boolean;
  autoApply: boolean;
  hardRuleProtected: boolean;
}

export interface SolveDiagnostics {
  warnings: string[];
  conflicts: string[];
  catalogVersion?: "CONFLICT-CATALOG-1.0.0";
  conflictDetails?: import("./conflict-catalog").ConflictDiagnostic[];
  hardConstraintViolations?: string[];
  objectiveBreakdown?: ObjectiveBreakdown;
  runMetrics?: SolverRunMetrics;
  localRepair?: LocalRepairDiagnostics;
  relaxationProposals?: RelaxationProposal[];
  modelMetrics?: SolverModelMetrics;
  preSolve?: PreSolveReport;
}

export interface SolverMetadata {
  solverVersion: string;
  contractVersion: typeof CONTRACT_VERSION;
  randomSeed: number;
  timeLimitSeconds: number;
  adapterContractVersion?: "SOLVER-ADAPTER-1.0.0";
  templateVersion?: string;
  academicPeriodId?: string;
  inputChecksum?: string;
  ruleSnapshotId?: string;
  ruleSetVersion?: string;
  ruleSnapshotHash?: string;
  objectiveContractVersion?: typeof SOLVER_OBJECTIVE_CONTRACT_VERSION;
  traceId?: string;
}

export interface SolveJobResult {
  schemaVersion: typeof CONTRACT_VERSION;
  jobId: string;
  status: SolveStatus;
  assignments: Assignment[];
  objectiveValue: number | null;
  diagnostics: SolveDiagnostics;
  metadata: SolverMetadata;
}

export type ScheduleVersionDiffOperation = "MOVE" | "ADD" | "REMOVE";

export interface ScheduleVersionDiffAssignment {
  id: string | null;
  lessonId: string;
  sessionIndex: number;
  timeSlotId: string | null;
  roomId: string | null;
  subjectLabel: string | null;
  classLabel: string | null;
  teacherLabel: string | null;
  roomLabel: string | null;
  slotLabel: string | null;
}

export interface ScheduleVersionDiffEntry {
  operation: ScheduleVersionDiffOperation;
  lessonId: string;
  sessionIndex: number;
  before: ScheduleVersionDiffAssignment | null;
  after: ScheduleVersionDiffAssignment | null;
}

export interface ScheduleVersionCompareResult {
  contractVersion: typeof SCHEDULE_VERSION_OPERATIONS_CONTRACT_VERSION;
  fromVersion: { id: string; versionNumber: number; status: string; revision: number; etag: string };
  toVersion: { id: string; versionNumber: number; status: string; revision: number; etag: string };
  summary: { moves: number; additions: number; removals: number; changedAssignments: number };
  score: {
    from: number | null;
    to: number | null;
    delta: number | null;
    available: boolean;
    lowerIsBetter: true;
  };
  diffs: ScheduleVersionDiffEntry[];
}

export type FreezeScopeResourceKind = "LESSON" | "TEACHER" | "CLASS" | "DAY" | "ROOM";

export interface FreezeScopeSelector {
  kind: FreezeScopeResourceKind;
  /** DAY uses the canonical decimal day string, for example "1". */
  id: string;
}

export interface FreezeScope {
  contractType: "FREEZE_SCOPE";
  contractVersion: typeof FREEZE_SCOPE_CONTRACT_VERSION;
  scopeId: string;
  schoolId: string;
  academicPeriodId: string;
  scheduleVersionId: string;
  baselineSnapshotHash: string;
  selectors: readonly FreezeScopeSelector[];
}

export interface FreezeAssignmentSnapshot {
  assignmentId: string;
  lessonId: string;
  sessionIndex: number;
  teacherId: string;
  classId: string;
  day: number;
  timeSlotId: string;
  roomId: string | null;
}

export interface FreezeChangeEvent {
  contractType: "FREEZE_CHANGE_EVENT";
  contractVersion: typeof FREEZE_SCOPE_CONTRACT_VERSION;
  eventId: string;
  schoolId: string;
  academicPeriodId: string;
  scheduleVersionId: string;
  baselineSnapshotHash: string;
  operation: "MOVE" | "ADD" | "REMOVE";
  before: FreezeAssignmentSnapshot | null;
  after: FreezeAssignmentSnapshot | null;
}

export interface FreezeResourceNode {
  key: string;
  kind: FreezeScopeResourceKind;
  id: string;
}

export interface FreezeNeighborhoodEdge {
  assignmentId: string;
  resourceKey: string;
}

export interface AffectedNeighborhood {
  contractType: "AFFECTED_NEIGHBORHOOD";
  contractVersion: typeof FREEZE_SCOPE_CONTRACT_VERSION;
  changeEventId: string;
  baselineSnapshotHash: string;
  changedResourceKeys: readonly string[];
  affectedAssignmentIds: readonly string[];
  affectedResources: readonly FreezeResourceNode[];
  edges: readonly FreezeNeighborhoodEdge[];
}

export type FreezeDecisionReason = "ALLOWED" | "FROZEN_RESOURCE" | "BASELINE_SNAPSHOT_MISMATCH" | "SCOPE_MISMATCH";

export interface FreezeChangeDecision {
  contractType: "FREEZE_DECISION";
  contractVersion: typeof FREEZE_SCOPE_CONTRACT_VERSION;
  eventId: string;
  allowed: boolean;
  reason: FreezeDecisionReason;
  violations: readonly FreezeScopeSelector[];
  neighborhood: AffectedNeighborhood;
}
