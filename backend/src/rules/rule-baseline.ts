import type { RuleDefinition, RuleScope } from "../contracts";

export const BASELINE_PROFILE_VERSION = "baseline-1.0.0";
export const BASELINE_PROFILE_NAME = "Bộ quy tắc nền mặc định";
export const BASELINE_SOURCE_URL = "https://schedule.local/rules/baseline";
export const BASELINE_SOURCE_LOCATOR = "SYSTEM-BASELINE-1.0.0";

interface BaselineRuleContext {
  schoolId: string;
  academicPeriodId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

function schoolPeriodScope(context: BaselineRuleContext): RuleScope {
  return {
    schoolId: context.schoolId,
    academicPeriodId: context.academicPeriodId,
  };
}

export function buildBaselineRuleDefinitions(context: BaselineRuleContext): RuleDefinition[] {
  const scope = schoolPeriodScope(context);
  return [
    {
      code: "RULE-TEACH-002",
      kind: "HARD",
      weight: null,
      sourceUrl: BASELINE_SOURCE_URL,
      sourceLocator: `${BASELINE_SOURCE_LOCATOR} · Định mức giáo viên`,
      effectiveFrom: context.effectiveFrom,
      effectiveTo: context.effectiveTo ?? null,
      scope,
      approvalState: "PENDING_STAKEHOLDER",
      parameters: {
        weeklyNormBySchoolLevel: { THCS: 19, THPT: 17, THCS_THPT: 19 },
      },
    },
    {
      code: "RULE-TEACH-003",
      kind: "HARD",
      weight: null,
      sourceUrl: BASELINE_SOURCE_URL,
      sourceLocator: `${BASELINE_SOURCE_LOCATOR} · Số tuần tính định mức`,
      effectiveFrom: context.effectiveFrom,
      effectiveTo: context.effectiveTo ?? null,
      scope,
      approvalState: "PENDING_STAKEHOLDER",
      parameters: { teachingWeeksForNorm: 35 },
    },
    {
      code: "RULE-TEACHER-MAX-WORKING-DAYS",
      kind: "HARD",
      weight: null,
      sourceUrl: BASELINE_SOURCE_URL,
      sourceLocator: `${BASELINE_SOURCE_LOCATOR} · Tối đa 5 ngày dạy/tuần`,
      effectiveFrom: context.effectiveFrom,
      effectiveTo: context.effectiveTo ?? null,
      scope: { ...scope, resourceType: "TEACHER" },
      approvalState: "PENDING_STAKEHOLDER",
      parameters: { maxDays: 5 },
    },
    {
      code: "RULE-SCHEDULE-NO-INTERNAL-GAPS",
      kind: "SOFT",
      weight: 10,
      sourceUrl: BASELINE_SOURCE_URL,
      sourceLocator: `${BASELINE_SOURCE_LOCATOR} · Ưu tiên liền tiết trong cùng buổi`,
      effectiveFrom: context.effectiveFrom,
      effectiveTo: context.effectiveTo ?? null,
      scope: { ...scope, resourceType: "CLASS" },
      approvalState: "PENDING_STAKEHOLDER",
      parameters: { granularity: "DAY_SHIFT" },
    },
  ];
}
