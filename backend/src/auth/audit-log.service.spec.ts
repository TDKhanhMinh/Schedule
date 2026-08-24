/// <reference types="jest" />

import type { Pool } from "pg";
import { AuditLogService } from "./audit-log.service";

const timestamp = "2026-08-24T00:00:00.000Z";

describe("AuditLogService", () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  let service: AuditLogService;

  beforeEach(() => {
    query.mockReset();
    service = new AuditLogService(pool);
  });

  it("records correlation, role and a redacted metadata envelope", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "audit-001",
          school_id: "school-001",
          action: "UPDATE",
          entity_type: "teacher",
          entity_id: "00000000-0000-4000-8000-000000000001",
          entity_key: null,
          actor_id: "scheduler-001",
          actor_role: "SCHEDULER",
          correlation_id: "req-001",
          metadata: { route: "/schools/school-001/teachers/1" },
          created_at: timestamp,
        },
      ],
    });

    await expect(
      service.record({
        schoolId: "school-001",
        action: "UPDATE",
        entityType: "teacher",
        entityId: "00000000-0000-4000-8000-000000000001",
        actorId: "scheduler-001",
        actorRole: "SCHEDULER",
        correlationId: "req-001",
        metadata: { route: "/schools/school-001/teachers/1", authorization: "secret-token" },
      }),
    ).resolves.toMatchObject({ action: "UPDATE", correlationId: "req-001", actorRole: "SCHEDULER" });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[7]).toBe("req-001");
    expect(JSON.parse(String(params[8]))).toEqual({
      route: "/schools/school-001/teachers/1",
      authorization: "[REDACTED]",
    });
  });

  it("keeps non-UUID job identifiers in entity_key", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "audit-002", created_at: timestamp }] });

    await service.record({
      schoolId: "school-001",
      action: "SOLVE",
      entityType: "optimization_job",
      entityId: "bull-job-001",
      actorId: "scheduler-001",
      actorRole: "SCHEDULER",
      correlationId: "req-002",
    });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params[3]).toBeNull();
    expect(params[4]).toBe("bull-job-001");
  });
});
