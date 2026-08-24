export const CONTRACT_VERSION = "1.0" as const;
export const OPTIMIZATION_QUEUE = "optimization" as const;
export const OPTIMIZATION_JOB_NAME = "optimization.solve" as const;

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";

export interface TimeSlot {
  id: string;
  day: number;
  period: number;
}

export interface LessonRequirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  requiredSessions: number;
  allowedSlotIds?: string[];
  fixedSlotId?: string;
}

export interface SolveJobOptions {
  timeLimitSeconds?: number;
}

export interface SolveJobRequest {
  schemaVersion: typeof CONTRACT_VERSION;
  jobId: string;
  schoolId: string;
  timeSlots: TimeSlot[];
  lessons: LessonRequirement[];
  options?: SolveJobOptions;
}

export interface Assignment {
  lessonId: string;
  sessionIndex: number;
  slotId: string;
}

export interface SolveDiagnostics {
  warnings: string[];
  conflicts: string[];
}

export interface SolveJobResult {
  schemaVersion: typeof CONTRACT_VERSION;
  jobId: string;
  status: SolveStatus;
  assignments: Assignment[];
  objectiveValue: number | null;
  diagnostics: SolveDiagnostics;
}

