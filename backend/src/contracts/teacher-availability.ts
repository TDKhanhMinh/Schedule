export const TEACHER_AVAILABILITY_CONTRACT_VERSION = "TEACHER-AVAILABILITY-1.0.0" as const;
export const TEACHER_AVAILABILITY_RULE_PREFIX = "RULE-TEACHER-AVAILABILITY-" as const;

export type TeacherAvailabilityStrength = "HARD_UNAVAILABLE" | "STRONG_PREFERENCE" | "SOFT_WISH";

export interface TeacherAvailabilityRuleSource {
  sourceUrl: string;
  sourceLocator?: string;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
}

export interface TeacherAvailabilityRule {
  ruleId: string;
  code: string;
  teacherId: string;
  strength: TeacherAvailabilityStrength;
  weight: number | null;
  dayOfWeek: number;
  shiftCode?: string;
  period?: number;
  blockedSlotIds: string[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string;
  source: TeacherAvailabilityRuleSource;
}

export interface TeacherAvailabilitySet {
  contractVersion: typeof TEACHER_AVAILABILITY_CONTRACT_VERSION;
  schoolId: string;
  academicPeriodId: string;
  effectiveAsOf: string;
  ruleSnapshotId: string;
  ruleSetVersion: string;
  ruleSnapshotHash: string;
  rules: TeacherAvailabilityRule[];
}

export interface AvailabilitySlot {
  id: string;
  day: number;
  period: number;
  shiftCode?: string;
}

export function availabilityRuleMatchesSlot(rule: TeacherAvailabilityRule, slot: AvailabilitySlot) {
  if (rule.blockedSlotIds.includes(slot.id)) return true;
  if (rule.dayOfWeek !== slot.day) return false;
  if (rule.shiftCode && rule.shiftCode !== slot.shiftCode) return false;
  if (rule.period && rule.period !== slot.period) return false;
  return true;
}
