import { buildBaselineRuleDefinitions } from "./rule-baseline";

describe("baseline rule profile", () => {
  it("builds the default school-period rules without teacher-specific data", () => {
    const rules = buildBaselineRuleDefinitions({
      schoolId: "school-001",
      academicPeriodId: "period-001",
      effectiveFrom: "2026-08-15",
    });

    expect(rules.map((rule) => rule.code)).toEqual([
      "RULE-TEACH-002",
      "RULE-TEACH-003",
      "RULE-TEACHER-MAX-WORKING-DAYS",
      "RULE-SCHEDULE-NO-INTERNAL-GAPS",
    ]);
    expect(rules[0]).toMatchObject({
      kind: "HARD",
      parameters: { weeklyNormBySchoolLevel: { THCS: 19, THPT: 17, THCS_THPT: 19 } },
      scope: { schoolId: "school-001", academicPeriodId: "period-001" },
    });
    expect(rules[2]).toMatchObject({
      kind: "HARD",
      scope: { resourceType: "TEACHER" },
      parameters: { maxDays: 5 },
    });
    expect(rules[3]).toMatchObject({
      kind: "SOFT",
      weight: 10,
      scope: { resourceType: "CLASS" },
      parameters: { granularity: "DAY_SHIFT" },
    });
  });
});
