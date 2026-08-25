import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { computeRuleSetSnapshotHash, getEffectiveRules, type RuleSetSnapshot } from "../contracts";

const APPROVED_AT = "2026-08-25T00:00:00.000Z";

function createSnapshot(overrides: Partial<RuleSetSnapshot> = {}): RuleSetSnapshot {
  return {
    snapshotId: "snapshot-001",
    ruleSetVersion: "RULE-SET-1.0.0",
    profileVersion: "1.0",
    registerVersion: "RULE-REGISTER-0.1.0",
    sourceUrl: "https://schedule.local/rules",
    sourceLocator: "RULE-EDU-001",
    effectiveFrom: "2025-04-22",
    effectiveTo: null,
    scope: { schoolLevel: "THCS", schoolId: "school-001" },
    approvalState: "APPROVED",
    approvedBy: "approver-001",
    approvedAt: APPROVED_AT,
    rules: [
      {
        code: "RULE-EDU-001",
        kind: "HARD",
        weight: null,
        sourceUrl: "https://schedule.local/rules",
        sourceLocator: "RULE-EDU-001",
        effectiveFrom: "2025-04-22",
        effectiveTo: null,
        scope: { schoolLevel: "THCS" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { durationMinutes: 45 },
      },
      {
        code: "RULE-SCHOOL-002",
        kind: "SOFT",
        weight: 2,
        sourceUrl: "https://schedule.local/rules",
        effectiveFrom: "2025-04-22",
        effectiveTo: "2025-12-31",
        scope: { schoolId: "school-001" },
        approvalState: "APPROVED",
        approvedBy: "approver-001",
        approvedAt: APPROVED_AT,
        parameters: { avoidLastPeriod: true },
      },
    ],
    snapshotHash: "0".repeat(64),
    capturedAt: APPROVED_AT,
    capturedBy: "scheduler-001",
    ...overrides,
  };
}

describe("RuleSetSnapshot contract", () => {
  it("defines the versioned source, scope, approval and rule fields", async () => {
    const schema = JSON.parse(
      await readFile(resolve(__dirname, "../../contracts/schemas/rule-set-snapshot.schema.json"), "utf8"),
    );

    expect(schema.properties.ruleSetVersion.pattern).toBe("^RULE-SET-[0-9]+\\.[0-9]+\\.[0-9]+$");
    expect(schema.$defs.canonicalTimestamp.pattern).toBe(
      "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
    );
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "snapshotId",
        "profileVersion",
        "registerVersion",
        "sourceUrl",
        "effectiveFrom",
        "scope",
        "approvalState",
        "rules",
        "snapshotHash",
      ]),
    );
    expect(schema.$defs.ruleDefinition.required).toEqual(
      expect.arrayContaining(["code", "kind", "weight", "sourceUrl", "effectiveFrom", "scope", "approvalState"]),
    );
  });

  it("hashes the exact snapshot and excludes expired rules", () => {
    const snapshot = createSnapshot();
    const hash = computeRuleSetSnapshotHash(snapshot);

    expect(hash).toBe("fe37e38f9db500a756e617da9db920eb57f6b74cfabb92b1c3973391b5639518");
    expect(getEffectiveRules(snapshot, "2025-06-01").map((rule) => rule.code)).toEqual([
      "RULE-EDU-001",
      "RULE-SCHOOL-002",
    ]);
    expect(getEffectiveRules(snapshot, "2026-01-01").map((rule) => rule.code)).toEqual(["RULE-EDU-001"]);
    expect(getEffectiveRules(createSnapshot({ approvalState: "PENDING_STAKEHOLDER" }), "2025-06-01")).toEqual([]);
  });
});
