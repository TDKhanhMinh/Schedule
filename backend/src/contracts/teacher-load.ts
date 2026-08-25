import type { RuleSetSnapshot } from "./rule-set";

export const TEACHER_LOAD_CONTRACT_VERSION = "TEACHER-LOAD-1.0.0" as const;
export const TEACHER_NORM_RULE_CODE = "RULE-TEACH-002" as const;
export const TEACHER_NORM_WEEKS_RULE_CODE = "RULE-TEACH-003" as const;
export const TEACHER_REDUCTION_RULE_PREFIX = "RULE-TEACH-REDUCTION-" as const;

export type TeacherSchoolLevel = "THCS" | "THPT" | "THCS_THPT";
export type TeacherLoadStatus = "UNDER_TARGET" | "AT_TARGET" | "OVER_TARGET";
export type TeacherLoadEnforcement = "REPORT_ONLY" | "HARD_CAP";

export interface TeacherLoadInput {
  schoolId: string;
  academicPeriodId: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  schoolLevel: TeacherSchoolLevel;
  assignedWeeklySessions: number;
  asOf: string;
}

export interface TeacherLoadRuleSource {
  code: string;
  sourceUrl: string;
  sourceLocator?: string;
  ruleSetVersion: string;
  snapshotHash: string;
}

export interface TeacherLoadReduction {
  code: string;
  roleCode: string;
  reductionSessionsPerWeek: number;
  source: TeacherLoadRuleSource;
}

export interface TeacherLoadCalculation {
  contractVersion: typeof TEACHER_LOAD_CONTRACT_VERSION;
  schoolId: string;
  academicPeriodId: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  schoolLevel: TeacherSchoolLevel;
  weeklyNormSessions: number;
  weeklyReductionSessions: number;
  targetAverageWeeklySessions: number;
  assignedAverageWeeklySessions: number;
  teachingWeeksForNorm: number;
  annualNormSessions: number;
  annualReductionSessions: number;
  annualTargetSessions: number;
  annualAssignedSessions: number;
  weeklyVarianceSessions: number;
  status: TeacherLoadStatus;
  enforcement: TeacherLoadEnforcement;
  hardWeeklyLimitSessions: number | null;
  reductions: TeacherLoadReduction[];
  ruleSources: TeacherLoadRuleSource[];
  warnings: string[];
}

export interface TeacherLoadReport {
  contractVersion: typeof TEACHER_LOAD_CONTRACT_VERSION;
  schoolId: string;
  academicPeriodId: string;
  effectiveAsOf: string;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
  loads: TeacherLoadCalculation[];
}

export function getTeacherLoadRuleSource(snapshot: RuleSetSnapshot, code: string): TeacherLoadRuleSource {
  const rule = snapshot.rules.find((candidate) => candidate.code === code);
  if (!rule) throw new Error(`Rule ${code} is not present in the snapshot`);
  return {
    code: rule.code,
    sourceUrl: rule.sourceUrl,
    ...(rule.sourceLocator ? { sourceLocator: rule.sourceLocator } : {}),
    ruleSetVersion: snapshot.ruleSetVersion,
    snapshotHash: snapshot.snapshotHash,
  };
}
