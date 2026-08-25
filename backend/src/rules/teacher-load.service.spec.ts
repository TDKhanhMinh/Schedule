import { BadRequestException } from "@nestjs/common";
import type { Pool } from "pg";
import type { RuleSetSnapshot } from "../contracts";
import { TeacherLoadCalculationService, TeacherLoadService } from "./teacher-load.service";

const snapshotHash = "0".repeat(64);
const approvedAt = "2026-08-25T00:00:00.000Z";

function createSnapshot(overrides: Partial<RuleSetSnapshot> = {}): RuleSetSnapshot {
  return {
    snapshotId: "snapshot-teacher-load-001",
    ruleSetVersion: "RULE-SET-1.0.0",
    profileVersion: "1.0",
    registerVersion: "RULE-REGISTER-0.1.0",
    sourceUrl: "https://schedule.local/rules",
    effectiveFrom: "2025-04-22",
    effectiveTo: null,
    scope: { schoolId: "school-001", academicPeriodId: "period-001", schoolLevel: "THCS" },
    approvalState: "APPROVED",
    approvedBy: "approver-001",
    approvedAt,
    rules: [
      {
        code: "RULE-TEACH-002",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/rules",
        sourceLocator: "SRC-TT05-2025#7.3.a",
        effectiveFrom: "2025-04-22",
        scope: { schoolLevel: "THCS" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt,
        parameters: {
          weeklyNormBySchoolLevel: { THCS: 19, THPT: 17 },
          weeklyAverageOnly: true,
        },
      },
      {
        code: "RULE-TEACH-003",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/rules",
        sourceLocator: "SRC-TT05-2025#7.2",
        effectiveFrom: "2025-04-22",
        scope: {},
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt,
        parameters: { teachingWeeksForNorm: 35 },
      },
      {
        code: "RULE-TEACH-REDUCTION-HEAD-DEPARTMENT",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/school-decision",
        sourceLocator: "DECISION-2026-001",
        effectiveFrom: "2026-08-15",
        scope: { schoolId: "school-001", academicPeriodId: "period-001", actorId: "teacher-001" },
        approvalState: "APPROVED",
        approvedBy: "principal-001",
        approvedAt,
        parameters: { roleCode: "HEAD_DEPARTMENT", reductionSessionsPerWeek: 2 },
      },
    ],
    snapshotHash,
    capturedAt: approvedAt,
    capturedBy: "scheduler-001",
    ...overrides,
  };
}

const input = {
  schoolId: "school-001",
  academicPeriodId: "period-001",
  teacherId: "teacher-001",
  teacherCode: "GV-001",
  teacherName: "Nguyễn An",
  schoolLevel: "THCS" as const,
  assignedWeeklySessions: 18,
  asOf: "2026-08-20",
};

describe("TeacherLoadCalculationService", () => {
  const calculator = new TeacherLoadCalculationService();

  it("calculates approved weekly norm, role reduction and annual target without creating a hard weekly cap", () => {
    const result = calculator.calculate(input, createSnapshot());

    expect(result).toMatchObject({
      contractVersion: "TEACHER-LOAD-1.0.0",
      weeklyNormSessions: 19,
      weeklyReductionSessions: 2,
      targetAverageWeeklySessions: 17,
      assignedAverageWeeklySessions: 18,
      teachingWeeksForNorm: 35,
      annualNormSessions: 665,
      annualReductionSessions: 70,
      annualTargetSessions: 595,
      annualAssignedSessions: 630,
      weeklyVarianceSessions: 1,
      status: "OVER_TARGET",
      enforcement: "REPORT_ONLY",
      hardWeeklyLimitSessions: null,
      warnings: ["ASSIGNED_LOAD_OVER_AVERAGE_TARGET"],
    });
    expect(result.reductions).toHaveLength(1);
    expect(result.reductions[0]).toMatchObject({ roleCode: "HEAD_DEPARTMENT", reductionSessionsPerWeek: 2 });
    expect(result.ruleSources.map((source) => source.code)).toEqual([
      "RULE-TEACH-002",
      "RULE-TEACH-003",
      "RULE-TEACH-REDUCTION-HEAD-DEPARTMENT",
    ]);
  });

  it("does not apply an expired role reduction and rejects an unapproved snapshot", () => {
    const expired = createSnapshot({
      rules: createSnapshot().rules.map((rule) =>
        rule.code.startsWith("RULE-TEACH-REDUCTION-") ? { ...rule, effectiveTo: "2026-08-19" } : rule,
      ),
    });
    expect(calculator.calculate(input, expired).weeklyReductionSessions).toBe(0);
    expect(() => calculator.calculate(input, createSnapshot({ approvalState: "PENDING_STAKEHOLDER" }))).toThrow(
      BadRequestException,
    );
  });

  it("selects the THPT norm from the approved snapshot map", () => {
    const thptSnapshot = createSnapshot({
      scope: { schoolId: "school-001", academicPeriodId: "period-001", schoolLevel: "THPT" },
      rules: createSnapshot().rules.map((rule) =>
        rule.code === "RULE-TEACH-002" ? { ...rule, scope: { schoolLevel: "THPT" } } : rule,
      ),
    });

    expect(
      calculator.calculate(
        { ...input, teacherId: "teacher-002", teacherCode: "GV-002", schoolLevel: "THPT", assignedWeeklySessions: 17 },
        thptSnapshot,
      ),
    ).toMatchObject({ weeklyNormSessions: 17, targetAverageWeeklySessions: 17, status: "AT_TARGET" });
  });
});

describe("TeacherLoadService", () => {
  it("builds a school/period report from PostgreSQL scope and active weekly demand", async () => {
    const query = jest.fn();
    const pool = { query } as unknown as Pool;
    query
      .mockResolvedValueOnce({ rows: [{ starts_on: "2026-08-15", ends_on: "2027-01-15" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "snapshot-teacher-load-001",
            rule_set_version: "RULE-SET-1.0.0",
            profile_version: "1.0",
            register_version: "RULE-REGISTER-0.1.0",
            source_url: "https://schedule.local/rules",
            source_locator: null,
            effective_from: "2025-04-22",
            effective_to: null,
            scope: { schoolId: "school-001", academicPeriodId: "period-001", schoolLevel: "THCS" },
            approval_state: "APPROVED",
            approved_by: "approver-001",
            approved_at: approvedAt,
            approval_reason: null,
            rules: createSnapshot().rules,
            snapshot_hash: snapshotHash,
            captured_at: approvedAt,
            captured_by: "scheduler-001",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            teacher_id: "teacher-001",
            teacher_code: "GV-001",
            teacher_name: "Nguyễn An",
            assigned_weekly_sessions: 18,
          },
        ],
      });

    const service = new TeacherLoadService(pool, new TeacherLoadCalculationService());
    await expect(
      service.listTeacherLoads("school-001", "period-001", "snapshot-teacher-load-001"),
    ).resolves.toMatchObject({
      contractVersion: "TEACHER-LOAD-1.0.0",
      effectiveAsOf: "2026-08-15",
      loads: [{ teacherId: "teacher-001", assignedAverageWeeklySessions: 18, targetAverageWeeklySessions: 17 }],
    });
    expect(query).toHaveBeenCalledTimes(3);
  });
});
