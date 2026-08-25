/// <reference types="jest" />

import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Pool } from "pg";
import type { AuditLogService } from "../auth/audit-log.service";
import { ScheduleVersionService } from "./schedule-version.service";

const timestamp = "2026-08-25T00:00:00.000Z";

const versionRow = (overrides: Record<string, unknown> = {}) => ({
  id: "version-001",
  school_id: "school-001",
  academic_period_id: "period-001",
  version_number: 1,
  status: "DRAFT" as const,
  source_run_id: null,
  created_by: "scheduler-001",
  approved_by: null,
  approved_at: null,
  locked_at: null,
  published_at: null,
  archived_at: null,
  rule_snapshot_id: null,
  rule_set_version: null,
  rule_snapshot_hash: null,
  input_snapshot_hash: null,
  schedule_snapshot_hash: null,
  revision: 1,
  status_changed_by: "scheduler-001",
  status_changed_at: timestamp,
  status_reason: null,
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
});

describe("ScheduleVersionService", () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  const client = { query: clientQuery, release: jest.fn() };
  const pool = { query, connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
  const auditLogs = { recordInTransaction: jest.fn() } as unknown as AuditLogService;
  let service: ScheduleVersionService;

  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    client.release.mockReset();
    (auditLogs.recordInTransaction as jest.Mock).mockReset();
    service = new ScheduleVersionService(pool, auditLogs);
  });

  it("creates a DRAFT with immutable snapshot metadata and maps the response", async () => {
    query.mockResolvedValueOnce({
      rows: [versionRow({ input_snapshot_hash: "a".repeat(64), schedule_snapshot_hash: "b".repeat(64) })],
    });

    await expect(
      service.create("school-001", "scheduler-001", {
        academicPeriodId: "period-001",
        inputSnapshotHash: "a".repeat(64),
        scheduleSnapshotHash: "b".repeat(64),
      }),
    ).resolves.toMatchObject({
      id: "version-001",
      status: "DRAFT",
      academicPeriodId: "period-001",
      inputSnapshotHash: "a".repeat(64),
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO schedule_versions"), [
      "school-001",
      "period-001",
      null,
      "scheduler-001",
      null,
      null,
      null,
      "a".repeat(64),
      "b".repeat(64),
    ]);
  });

  it("rejects incomplete rule snapshot references before touching PostgreSQL", async () => {
    await expect(
      service.create("school-001", "scheduler-001", {
        academicPeriodId: "period-001",
        ruleSnapshotId: "snapshot-001",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an illegal lifecycle transition", async () => {
    query.mockResolvedValueOnce({ rows: [versionRow({ status: "DRAFT" })] });

    await expect(
      service.transition("school-001", "version-001", "reviewer-001", { toStatus: "PUBLISHED" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("moves a version through a valid transition and records the actor reason", async () => {
    query
      .mockResolvedValueOnce({ rows: [versionRow({ status: "LOCKED" })] })
      .mockResolvedValueOnce({ rows: [versionRow({ status: "PUBLISHED", published_at: timestamp })] });

    await expect(
      service.transition("school-001", "version-001", "publisher-001", {
        toStatus: "PUBLISHED",
        reason: "Pilot review approved",
      }),
    ).resolves.toMatchObject({ status: "PUBLISHED", publishedAt: timestamp });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE id = $1 AND school_id = $2 AND status = $6"),
      ["version-001", "school-001", "PUBLISHED", "publisher-001", "Pilot review approved", "LOCKED"],
    );
  });

  it("returns append-only lifecycle audit in chronological order", async () => {
    query.mockResolvedValueOnce({ rows: [versionRow()] }).mockResolvedValueOnce({
      rows: [
        {
          id: "transition-001",
          school_id: "school-001",
          schedule_version_id: "version-001",
          from_status: null,
          to_status: "DRAFT",
          actor_id: "scheduler-001",
          reason: null,
          correlation_id: null,
          created_at: timestamp,
        },
      ],
    });

    await expect(service.listTransitions("school-001", "version-001")).resolves.toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: "DRAFT", actorId: "scheduler-001" }),
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale ETag with the current snapshot and performs no write", async () => {
    const currentAssignment = {
      id: "assignment-001",
      lesson_id: "lesson-001",
      session_index: 0,
      time_slot_id: "slot-001",
      room_id: "room-001",
    };
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [versionRow({ revision: 2 })] })
      .mockResolvedValueOnce({ rows: [currentAssignment] })
      .mockResolvedValue({ rows: [] });

    await expect(
      service.updateAssignment(
        "school-001",
        "version-001",
        "lesson-001",
        0,
        "scheduler-001",
        { timeSlotId: "slot-002" },
        '"schedule-version:version-001:1"',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SCHEDULE_VERSION_CONCURRENT_UPDATE",
        currentSnapshot: expect.objectContaining({
          etag: '"schedule-version:version-001:2"',
          assignments: [expect.objectContaining({ lessonId: "lesson-001", timeSlotId: "slot-001" })],
        }),
      }),
    });
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE schedule_assignments"))).toBe(false);
  });

  it("revalidates an edit in one transaction and increments the revision", async () => {
    const currentAssignment = {
      id: "assignment-001",
      lesson_id: "lesson-001",
      session_index: 0,
      time_slot_id: "slot-001",
      room_id: "room-001",
    };
    const targetAssignment = { ...currentAssignment, class_id: "class-001", teacher_id: "teacher-001" };
    const updatedAssignment = { ...currentAssignment, time_slot_id: "slot-002" };
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [versionRow({ revision: 1 })] })
      .mockResolvedValueOnce({ rows: [currentAssignment] })
      .mockResolvedValueOnce({ rows: [targetAssignment] })
      .mockResolvedValueOnce({ rows: [{ id: "slot-002" }] })
      .mockResolvedValueOnce({ rows: [{ id: "room-001" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ revision: 2 }] })
      .mockResolvedValueOnce({ rows: [versionRow({ revision: 2 })] })
      .mockResolvedValueOnce({ rows: [updatedAssignment] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateAssignment(
        "school-001",
        "version-001",
        "lesson-001",
        0,
        "scheduler-001",
        { timeSlotId: "slot-002" },
        '"schedule-version:version-001:1"',
      ),
    ).resolves.toMatchObject({
      contractVersion: "SCHEDULE-EDIT-1.0.0",
      revision: 2,
      etag: '"schedule-version:version-001:2"',
      assignments: [expect.objectContaining({ timeSlotId: "slot-002" })],
    });
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE schedule_assignments"))).toBe(true);
    expect(auditLogs.recordInTransaction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        entityType: "schedule_assignment",
        entityKey: "version-001",
        metadata: expect.objectContaining({
          manualEdit: true,
          fromTimeSlotId: "slot-001",
          toTimeSlotId: "slot-002",
          fromRevision: 1,
          toRevision: 2,
        }),
      }),
    );
  });
});
