import { BadRequestException } from "@nestjs/common";
import type { RuleSetSnapshot } from "../contracts";
import { TeacherAvailabilityCalculationService, TeacherAvailabilityService } from "./teacher-availability.service";

const APPROVED_AT = "2026-08-25T00:00:00.000Z";
const SNAPSHOT_HASH = "0".repeat(64);

function createSnapshot(overrides: Partial<RuleSetSnapshot> = {}): RuleSetSnapshot {
  return {
    snapshotId: "snapshot-001",
    ruleSetVersion: "RULE-SET-1.0.0",
    profileVersion: "1.0",
    registerVersion: "RULE-REGISTER-0.1.0",
    sourceUrl: "https://schedule.local/rules",
    sourceLocator: "PILOT-AVAILABILITY",
    effectiveFrom: "2026-09-01",
    effectiveTo: "2027-01-15",
    scope: { schoolId: "school-001", academicPeriodId: "period-001" },
    approvalState: "APPROVED",
    approvedBy: "approver-001",
    approvedAt: APPROVED_AT,
    rules: [
      {
        code: "RULE-TEACHER-AVAILABILITY-HARD-001",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/decision",
        sourceLocator: "DECISION-001",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        scope: { schoolId: "school-001", academicPeriodId: "period-001", actorType: "TEACHER", actorId: "teacher-001" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { constraintType: "UNAVAILABLE", dayOfWeek: 1, shiftCode: "MORNING", reason: "Leave" },
      },
      {
        code: "RULE-TEACHER-AVAILABILITY-STRONG-001",
        kind: "SOFT",
        weight: 10,
        sourceUrl: "https://schedule.local/pilot",
        sourceLocator: "Availability!A2:G2",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2027-01-15",
        scope: { schoolId: "school-001", academicPeriodId: "period-001", actorType: "TEACHER", actorId: "teacher-001" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { preferenceLevel: "STRONG", dayOfWeek: 3, period: 2 },
      },
      {
        code: "RULE-TEACHER-AVAILABILITY-SOFT-001",
        kind: "SOFT",
        weight: 1,
        sourceUrl: "https://schedule.local/pilot",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-09-30",
        scope: { schoolId: "school-001", academicPeriodId: "period-001", actorType: "TEACHER", actorId: "teacher-001" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { preferenceLevel: "SOFT", dayOfWeek: 4 },
      },
      {
        code: "RULE-TEACHER-AVAILABILITY-OTHER-TEACHER",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/decision",
        effectiveFrom: "2026-09-01",
        scope: { schoolId: "school-001", actorType: "TEACHER", actorId: "teacher-002" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { constraintType: "UNAVAILABLE", dayOfWeek: 1 },
      },
    ],
    snapshotHash: SNAPSHOT_HASH,
    capturedAt: APPROVED_AT,
    capturedBy: "scheduler-001",
    ...overrides,
  };
}

const slots = [
  { id: "mon-morning-1", day: 1, period: 1, shift_code: "MORNING" },
  { id: "mon-morning-2", day: 1, period: 2, shift_code: "MORNING" },
  { id: "wed-morning-1", day: 3, period: 1, shift_code: "MORNING" },
  { id: "wed-morning-2", day: 3, period: 2, shift_code: "MORNING" },
  { id: "thu-morning-1", day: 4, period: 1, shift_code: "MORNING" },
];

describe("TeacherAvailabilityCalculationService", () => {
  const service = new TeacherAvailabilityCalculationService();

  it("projects hard unavailable, strong preference and soft wish with matching slot IDs", () => {
    const result = service.calculate(
      { schoolId: "school-001", academicPeriodId: "period-001", effectiveAsOf: "2026-09-01" },
      createSnapshot(),
      slots,
    );

    expect(result.contractVersion).toBe("TEACHER-AVAILABILITY-1.0.0");
    expect(result.rules.map((rule) => rule.strength)).toEqual([
      "HARD_UNAVAILABLE",
      "STRONG_PREFERENCE",
      "SOFT_WISH",
      "HARD_UNAVAILABLE",
    ]);
    expect(result.rules[0].blockedSlotIds).toEqual(["mon-morning-1", "mon-morning-2"]);
    expect(result.rules[1].blockedSlotIds).toEqual(["wed-morning-2"]);
    expect(result.rules[2].blockedSlotIds).toEqual(["thu-morning-1"]);
    expect(result.rules[0].weight).toBeNull();
    expect(result.rules[1].source.ruleSnapshotHash).toBe(SNAPSHOT_HASH);
  });

  it("filters expired rules and teacher scope", () => {
    const result = service.calculate(
      { schoolId: "school-001", academicPeriodId: "period-001", effectiveAsOf: "2026-10-01", teacherId: "teacher-001" },
      createSnapshot(),
      slots,
    );

    expect(result.rules.map((rule) => rule.code)).toEqual([
      "RULE-TEACHER-AVAILABILITY-HARD-001",
      "RULE-TEACHER-AVAILABILITY-STRONG-001",
    ]);
  });

  it("rejects an unapproved snapshot and invalid hard rule semantics", () => {
    expect(() =>
      service.calculate(
        { schoolId: "school-001", academicPeriodId: "period-001", effectiveAsOf: "2026-09-01" },
        createSnapshot({ approvalState: "PENDING_STAKEHOLDER" }),
        slots,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      service.calculate(
        { schoolId: "school-001", academicPeriodId: "period-001", effectiveAsOf: "2026-09-01" },
        createSnapshot({
          rules: [
            {
              ...createSnapshot().rules[0],
              parameters: { dayOfWeek: 1 },
            },
          ],
        }),
        slots,
      ),
    ).toThrow(BadRequestException);
  });
});

describe("TeacherAvailabilityService", () => {
  it("loads period, snapshot and slots from the school boundary", async () => {
    const rows = [
      { starts_on: "2026-10-01" },
      {
        id: "snapshot-001",
        rule_set_version: "RULE-SET-1.0.0",
        profile_version: "1.0",
        register_version: "RULE-REGISTER-0.1.0",
        source_url: "https://schedule.local/rules",
        source_locator: "PILOT",
        effective_from: "2026-09-01",
        effective_to: "2027-01-15",
        scope: { schoolId: "school-001" },
        approval_state: "APPROVED",
        approved_by: "approver-001",
        approved_at: APPROVED_AT,
        approval_reason: null,
        rules: createSnapshot().rules,
        snapshot_hash: SNAPSHOT_HASH,
        captured_at: APPROVED_AT,
        captured_by: "scheduler-001",
      },
      ...slots,
    ];
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [rows[0]] })
        .mockResolvedValueOnce({ rows: [rows[1]] })
        .mockResolvedValueOnce({ rows: rows.slice(2) }),
    };
    const service = new TeacherAvailabilityService(pool as never, new TeacherAvailabilityCalculationService());

    const result = await service.listTeacherAvailability("school-001", "period-001", "snapshot-001", "teacher-001");

    expect(result.rules.map((rule) => rule.code)).toEqual([
      "RULE-TEACHER-AVAILABILITY-HARD-001",
      "RULE-TEACHER-AVAILABILITY-STRONG-001",
    ]);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
