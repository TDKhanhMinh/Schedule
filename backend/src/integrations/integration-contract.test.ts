/// <reference types="jest" />

import {
  SCHOOL_INTEGRATION_CONTRACT_VERSION,
  WebhookReplayLedger,
  classifyWebhookFailure,
  mapImportRow,
  signWebhook,
  verifyWebhookSignature,
  type ImportMappingProfile,
  type WebhookEnvelope,
} from "./integration-contract";

const envelope: WebhookEnvelope = {
  contractVersion: SCHOOL_INTEGRATION_CONTRACT_VERSION,
  eventId: "event-001",
  eventType: "lesson.requirements.changed",
  source: "school-sis",
  keyId: "key-current",
  occurredAt: "2026-08-26T00:00:00.000Z",
  payload: { externalId: "row-001", requiredSessions: 2 },
};
const profile: ImportMappingProfile = {
  profileId: "sis-v1",
  version: "1.0.0",
  source: "school-sis",
  requiredExternalFields: ["class_code", "subject_code", "teacher_code", "sessions"],
  fieldMap: {
    class_code: "classCode",
    subject_code: "subjectCode",
    teacher_code: "teacherCode",
    sessions: "requiredSessions",
  },
};

describe("school integration contract", () => {
  it("verifies current/previous secrets and rejects tampering", () => {
    const signature = signWebhook(envelope, "current-secret");
    expect(
      verifyWebhookSignature(envelope, signature, [
        { keyId: "key-current", secret: "current-secret", state: "ACTIVE" },
      ]),
    ).toMatchObject({ valid: true, reason: "VALID" });
    expect(
      verifyWebhookSignature({ ...envelope, payload: { ...envelope.payload, requiredSessions: 3 } }, signature, [
        { keyId: "key-current", secret: "current-secret", state: "ACTIVE" },
      ]),
    ).toMatchObject({ valid: false, reason: "MISMATCH" });
    const previous = { ...envelope, keyId: "key-previous" };
    expect(
      verifyWebhookSignature(previous, signWebhook(previous, "previous-secret"), [
        { keyId: "key-previous", secret: "previous-secret", state: "PREVIOUS" },
      ]),
    ).toMatchObject({ valid: true, keyId: "key-previous" });
  });
  it("deduplicates replayed events and isolates invalid mappings", () => {
    const ledger = new WebhookReplayLedger();
    expect(ledger.accept("event-001")).toEqual({ accepted: true, reason: "NEW_EVENT" });
    expect(ledger.accept("event-001")).toEqual({ accepted: false, reason: "DUPLICATE_EVENT" });
    expect(
      mapImportRow(profile, { class_code: "7A", subject_code: "MATH", teacher_code: "GV1", sessions: 2 }),
    ).toMatchObject({ accepted: true, canonicalRow: { requiredSessions: 2 } });
    expect(
      mapImportRow(profile, { class_code: "7A", subject_code: "MATH", teacher_code: "GV1", sessions: "two" }),
    ).toMatchObject({ accepted: false, canonicalRow: null, diagnostics: [{ code: "CANONICAL_FIELD_INVALID" }] });
  });
  it("classifies retryable and dead-letter outcomes", () => {
    expect(classifyWebhookFailure(503, 1)).toMatchObject({ action: "RETRY", nextAttempt: 2 });
    expect(classifyWebhookFailure(400, 1)).toMatchObject({ action: "DEAD_LETTER" });
    expect(classifyWebhookFailure(503, 5)).toMatchObject({ action: "DEAD_LETTER", reason: "MAX_ATTEMPTS_REACHED" });
  });
});
