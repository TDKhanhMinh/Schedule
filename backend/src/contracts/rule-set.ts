import { createHash } from "node:crypto";

export const RULE_SET_VERSION = "RULE-SET-1.0.0" as const;

export type RuleApprovalState = "PENDING_STAKEHOLDER" | "APPROVED" | "REVOKED";
export type RuleKind = "HARD" | "SOFT";

export interface RuleScope {
  schoolId?: string;
  academicPeriodId?: string;
  schoolLevel?: "THCS" | "THPT" | "THCS_THPT";
  actorType?: "SYSTEM" | "SCHOOL" | "TEACHER";
  actorId?: string;
}

export interface RuleDefinition {
  code: string;
  kind: RuleKind;
  weight: number | null;
  sourceUrl: string;
  sourceLocator?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  scope: RuleScope;
  approvalState: RuleApprovalState;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  parameters: Record<string, unknown>;
}

export interface RuleSetSnapshot {
  snapshotId: string;
  ruleSetVersion: string;
  profileVersion: string;
  registerVersion: string;
  sourceUrl: string;
  sourceLocator?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  scope: RuleScope;
  approvalState: RuleApprovalState;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  rules: RuleDefinition[];
  snapshotHash: string;
  capturedAt: string;
  capturedBy: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    // Optional nulls and omitted fields are equivalent; HARD weight null is semantic.
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, nested]) => nested !== null || key === "weight")
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function computeRuleSetSnapshotHash(snapshot: RuleSetSnapshot): string {
  const payload = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotHash"));
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export function getEffectiveRules(snapshot: RuleSetSnapshot, asOf: string): RuleDefinition[] {
  if (snapshot.approvalState !== "APPROVED") return [];
  return snapshot.rules.filter((rule) => {
    if (rule.approvalState !== "APPROVED") return false;
    if (asOf < rule.effectiveFrom) return false;
    return !rule.effectiveTo || asOf <= rule.effectiveTo;
  });
}
