/// <reference types="jest" />

import type { Pool } from "pg";
import { RuleManagementService } from "./rule-management.service";

const profileRow = {
  id: "profile-001",
  tenant_id: "tenant-001",
  school_id: "school-001",
  academic_period_id: "period-001",
  version: "1.0.0",
  name: "Pilot rules",
  status: "DRAFT" as const,
  register_version: "RULE-REGISTER-0.1.0",
  source_url: "https://schedule.local/rules",
  source_locator: "PILOT",
  effective_from: "2026-09-01",
  effective_to: null,
  scope: { schoolId: "school-001", academicPeriodId: "period-001" },
  approval_state: "PENDING_STAKEHOLDER" as const,
  approved_by: null,
  approved_at: null,
  approval_reason: null,
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

const availabilityRule = {
  id: "rule-001",
  tenant_id: "tenant-001",
  rule_profile_id: "profile-001",
  code: "RULE-TEACHER-AVAILABILITY-001",
  kind: "HARD" as const,
  weight: null,
  source_url: "https://schedule.local/rules",
  source_locator: "PILOT!A2",
  effective_from: "2026-09-01",
  effective_to: null,
  scope: {
    schoolId: "school-001",
    academicPeriodId: "period-001",
    actorType: "TEACHER",
    actorId: "teacher-001",
  },
  approval_state: "PENDING_STAKEHOLDER" as const,
  approved_by: null,
  approved_at: null,
  approval_reason: null,
  parameters: { dayOfWeek: 1, shiftCode: "MORNING", constraintType: "UNAVAILABLE" },
  created_at: "2026-08-28T00:00:00.000Z",
  updated_at: "2026-08-28T00:00:00.000Z",
};

describe("RuleManagementService", () => {
  const query = jest.fn();
  const auditLogs = { recordInTransaction: jest.fn() };
  let service: RuleManagementService;

  beforeEach(() => {
    query.mockReset();
    service = new RuleManagementService({ query } as unknown as Pool, auditLogs as never);
  });

  it("returns the versioned catalog and legacy availability support", () => {
    expect(service.getCatalog()).toMatchObject({
      catalogVersion: "RULE-CATALOG-1.0.0",
      schemaVersion: "1.0",
    });
    expect(service.getCatalog().ruleTypes.some((entry) => entry.code === "RULE-SCHEDULE-NO-INTERNAL-GAPS")).toBe(true);
  });

  it("validates an existing supported availability rule", async () => {
    query.mockResolvedValueOnce({ rows: [profileRow] }).mockResolvedValueOnce({ rows: [availabilityRule] });

    await expect(service.validateProfile("school-001", "profile-001")).resolves.toMatchObject({
      valid: true,
      canCreateSnapshot: true,
      counts: { total: 1, hard: 1, soft: 0, supported: 1 },
      issues: [],
    });
  });

  it("rejects a hard rule that tries to carry a soft weight", async () => {
    query.mockResolvedValueOnce({ rows: [profileRow] });

    await expect(
      service.createRule("school-001", "profile-001", {
        code: "RULE-TEACHER-AVAILABILITY-002",
        kind: "HARD",
        weight: 10,
        sourceUrl: "https://schedule.local/rules",
        effectiveFrom: "2026-09-01",
        scope: { actorType: "TEACHER", actorId: "teacher-001" },
        parameters: { dayOfWeek: 1 },
      }),
    ).rejects.toMatchObject({ response: { code: "HARD_RULE_WEIGHT_FORBIDDEN" } });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("allows school-wide teacher and class baseline scopes", async () => {
    const maxWorkingDaysRule = {
      ...availabilityRule,
      code: "RULE-TEACHER-MAX-WORKING-DAYS",
      scope: { schoolId: "school-001", academicPeriodId: "period-001", resourceType: "TEACHER" },
      parameters: { maxDays: 5 },
    };
    const noInternalGapsRule = {
      ...availabilityRule,
      code: "RULE-SCHEDULE-NO-INTERNAL-GAPS",
      kind: "SOFT" as const,
      weight: 10,
      scope: { schoolId: "school-001", academicPeriodId: "period-001", resourceType: "CLASS" },
      parameters: { granularity: "DAY_SHIFT" },
    };
    query.mockResolvedValueOnce({ rows: [profileRow] }).mockResolvedValueOnce({
      rows: [maxWorkingDaysRule, noInternalGapsRule],
    });

    await expect(service.validateProfile("school-001", "profile-001")).resolves.toMatchObject({
      valid: true,
      canCreateSnapshot: true,
      counts: { total: 2, hard: 1, soft: 1, supported: 2 },
      issues: [],
    });
  });

  it("validates a subject-scoped shift preference", async () => {
    const subjectShiftRule = {
      ...availabilityRule,
      code: "RULE-SUBJECT-SHIFT-PREFERENCE",
      kind: "SOFT" as const,
      weight: 10,
      scope: {
        schoolId: "school-001",
        academicPeriodId: "period-001",
        resourceType: "SUBJECT",
        resourceIds: ["subject-001"],
      },
      parameters: { preferredShift: "MAIN" },
    };
    query.mockResolvedValueOnce({ rows: [profileRow] }).mockResolvedValueOnce({ rows: [subjectShiftRule] });

    await expect(service.validateProfile("school-001", "profile-001")).resolves.toMatchObject({
      valid: true,
      canCreateSnapshot: true,
      counts: { total: 1, hard: 0, soft: 1, supported: 1 },
      issues: [],
    });
  });

  it("captures current homeroom assignments as derived snapshot rules", async () => {
    const baselineRule = {
      ...availabilityRule,
      code: "RULE-TEACH-002",
      scope: { schoolId: "school-001", academicPeriodId: "period-001" },
      parameters: { weeklyNormBySchoolLevel: { THCS: 19, THPT: 17, THCS_THPT: 19 } },
    };
    const snapshotRow = {
      id: "snapshot-001",
      tenant_id: "tenant-001",
      school_id: "school-001",
      rule_profile_id: "profile-001",
      rule_set_version: "RULE-SET-1.0.0",
      profile_version: "1.0.0",
      register_version: "RULE-REGISTER-0.1.0",
      source_url: "https://schedule.local/rules",
      source_locator: "PILOT",
      effective_from: "2026-09-01",
      effective_to: null,
      scope: { schoolId: "school-001", academicPeriodId: "period-001" },
      approval_state: "PENDING_STAKEHOLDER" as const,
      approved_by: null,
      approved_at: null,
      approval_reason: null,
      rules: [],
      snapshot_hash: "0".repeat(64),
      captured_at: "2026-08-28T00:00:00.000Z",
      captured_by: "scheduler-001",
    };
    query
      .mockResolvedValueOnce({ rows: [profileRow] })
      .mockResolvedValueOnce({ rows: [profileRow] })
      .mockResolvedValueOnce({ rows: [baselineRule] })
      .mockResolvedValueOnce({ rows: [baselineRule] })
      .mockResolvedValueOnce({
        rows: [
          {
            class_code: "6A1",
            teacher_id: "teacher-001",
            weekly_reduction_periods: 4,
            rule_code: "TT_05_2025_D9_1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [snapshotRow] });

    await service.createSnapshot("school-001", "profile-001", "scheduler-001");

    const insertParams = query.mock.calls[5][1] as unknown[];
    expect(JSON.parse(String(insertParams[12]))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RULE-TEACH-REDUCTION-HOMEROOM-6A1",
          scope: expect.objectContaining({ actorId: "teacher-001", resourceType: "TEACHER" }),
          parameters: { roleCode: "HOMEROOM_TEACHER", reductionSessionsPerWeek: 4 },
        }),
      ]),
    );
  });

  it("provisions an idempotent baseline profile and its default rules", async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "period-001", tenant_id: "tenant-001", starts_on: "2026-08-15", ends_on: "2027-05-31" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "baseline-profile-001" }] })
      .mockResolvedValue({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() };
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const baselineService = new RuleManagementService(pool, auditLogs as never);

    await expect(baselineService.provisionBaselineProfile("school-001", "period-001")).resolves.toMatchObject({
      profileId: "baseline-profile-001",
      createdRuleCodes: [
        "RULE-TEACH-002",
        "RULE-TEACH-003",
        "RULE-TEACHER-MAX-WORKING-DAYS",
        "RULE-SCHEDULE-NO-INTERNAL-GAPS",
      ],
    });
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO rule_definitions"))).toHaveLength(
      4,
    );
  });
});
