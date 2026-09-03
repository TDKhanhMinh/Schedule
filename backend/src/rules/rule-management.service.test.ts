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
});
