import { createHmac, timingSafeEqual } from "node:crypto";

export const SCHOOL_INTEGRATION_CONTRACT_VERSION = "SCHOOL-INTEGRATION-1.0.0" as const;
export const CANONICAL_IMPORT_FIELDS = [
  "classCode",
  "subjectCode",
  "teacherCode",
  "requiredSessions",
  "roomCode",
] as const;

export interface WebhookEnvelope {
  contractVersion: typeof SCHOOL_INTEGRATION_CONTRACT_VERSION;
  eventId: string;
  eventType: string;
  source: string;
  keyId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
export interface WebhookSecret {
  keyId: string;
  secret: string;
  state: "ACTIVE" | "PREVIOUS";
}
export interface SignatureVerification {
  valid: boolean;
  keyId: string | null;
  reason: "VALID" | "MISSING" | "UNKNOWN_KEY" | "MISMATCH" | "INVALID_FORMAT";
}
export interface ImportMappingProfile {
  profileId: string;
  version: string;
  source: string;
  requiredExternalFields: readonly string[];
  fieldMap: Readonly<Record<string, string>>;
}
export interface IntegrationDiagnostic {
  code: "MAPPING_PROFILE_INVALID" | "REQUIRED_FIELD_MISSING" | "CANONICAL_FIELD_INVALID";
  field?: string;
  message: string;
}
export interface MappingResult {
  accepted: boolean;
  canonicalRow: Record<string, unknown> | null;
  diagnostics: readonly IntegrationDiagnostic[];
}
export interface RetryDecision {
  action: "RETRY" | "DEAD_LETTER";
  attempt: number;
  nextAttempt: number | null;
  reason: string;
}

function canonicalPayload(envelope: WebhookEnvelope) {
  return JSON.stringify({
    contractVersion: envelope.contractVersion,
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    source: envelope.source,
    keyId: envelope.keyId,
    occurredAt: envelope.occurredAt,
    payload: envelope.payload,
  });
}

export function signWebhook(envelope: WebhookEnvelope, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(canonicalPayload(envelope)).digest("hex")}`;
}

export function verifyWebhookSignature(
  envelope: WebhookEnvelope,
  signature: string | undefined,
  secrets: readonly WebhookSecret[],
): SignatureVerification {
  if (!signature) return { valid: false, keyId: null, reason: "MISSING" };
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature)) return { valid: false, keyId: null, reason: "INVALID_FORMAT" };
  const key = secrets.find((candidate) => candidate.keyId === envelope.keyId);
  if (!key) return { valid: false, keyId: null, reason: "UNKNOWN_KEY" };
  const expected = Buffer.from(signWebhook(envelope, key.secret));
  const received = Buffer.from(signature);
  const valid = expected.length === received.length && timingSafeEqual(expected, received);
  return { valid, keyId: key.keyId, reason: valid ? "VALID" : "MISMATCH" };
}

export class WebhookReplayLedger {
  private readonly eventIds = new Set<string>();
  constructor(private readonly maxEntries = 10_000) {}
  accept(eventId: string) {
    if (this.eventIds.has(eventId)) return { accepted: false, reason: "DUPLICATE_EVENT" as const };
    this.eventIds.add(eventId);
    if (this.eventIds.size > this.maxEntries) {
      const oldest = this.eventIds.values().next().value;
      if (oldest) this.eventIds.delete(oldest);
    }
    return { accepted: true, reason: "NEW_EVENT" as const };
  }
}

export function mapImportRow(profile: ImportMappingProfile, row: Readonly<Record<string, unknown>>): MappingResult {
  const diagnostics: IntegrationDiagnostic[] = [];
  const canonicalFields = new Set<string>(CANONICAL_IMPORT_FIELDS);
  for (const [externalField, canonicalField] of Object.entries(profile.fieldMap)) {
    if (!canonicalFields.has(canonicalField))
      diagnostics.push({
        code: "MAPPING_PROFILE_INVALID",
        field: externalField,
        message: `Canonical field không hỗ trợ: ${canonicalField}.`,
      });
  }
  for (const externalField of profile.requiredExternalFields) {
    if (!(externalField in row) || row[externalField] === null || row[externalField] === "")
      diagnostics.push({
        code: "REQUIRED_FIELD_MISSING",
        field: externalField,
        message: `Thiếu field bắt buộc: ${externalField}.`,
      });
  }
  const canonicalRow: Record<string, unknown> = {};
  for (const [externalField, canonicalField] of Object.entries(profile.fieldMap))
    if (externalField in row) canonicalRow[canonicalField] = row[externalField];
  if (
    "requiredSessions" in canonicalRow &&
    (!Number.isInteger(canonicalRow.requiredSessions) || Number(canonicalRow.requiredSessions) <= 0)
  )
    diagnostics.push({
      code: "CANONICAL_FIELD_INVALID",
      field: "requiredSessions",
      message: "requiredSessions phải là số nguyên dương.",
    });
  return {
    accepted: diagnostics.length === 0,
    canonicalRow: diagnostics.length === 0 ? canonicalRow : null,
    diagnostics,
  };
}

export function classifyWebhookFailure(httpStatus: number, attempt: number, maxAttempts = 5): RetryDecision {
  const retryable = httpStatus === 408 || httpStatus === 409 || httpStatus === 429 || httpStatus >= 500;
  if (!retryable) return { action: "DEAD_LETTER", attempt, nextAttempt: null, reason: "NON_RETRYABLE_STATUS" };
  if (attempt >= maxAttempts)
    return { action: "DEAD_LETTER", attempt, nextAttempt: null, reason: "MAX_ATTEMPTS_REACHED" };
  return { action: "RETRY", attempt, nextAttempt: attempt + 1, reason: "RETRYABLE_STATUS" };
}
