import type { TeacherAvailabilitySet } from "./teacher-availability";
import type { PreSolveReport, RoomCapability } from "./pre-solve";

export const CONTRACT_VERSION = "1.0" as const;
export const SOLVER_OBJECTIVE_CONTRACT_VERSION = "SOLVER-OBJECTIVE-1.0.0" as const;
export const OPTIMIZATION_QUEUE = "optimization" as const;
export const OPTIMIZATION_JOB_NAME = "optimization.solve" as const;

export * from "./rule-set";
export * from "./conflict-catalog";
export * from "./pre-solve";
export * from "./solver-adapter";
export * from "./teacher-availability";
export * from "./teacher-load";

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";

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

export interface SolveJobOptions {
  timeLimitSeconds?: number;
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
  rooms?: RoomCapability[];
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

export interface SolveDiagnostics {
  warnings: string[];
  conflicts: string[];
  catalogVersion?: "CONFLICT-CATALOG-1.0.0";
  conflictDetails?: import("./conflict-catalog").ConflictDiagnostic[];
  hardConstraintViolations?: string[];
  objectiveBreakdown?: ObjectiveBreakdown;
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
