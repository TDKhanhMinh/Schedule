/// <reference types="jest" />

import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Pool } from "pg";
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
  status_changed_by: "scheduler-001",
  status_changed_at: timestamp,
  status_reason: null,
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
});

describe("ScheduleVersionService", () => {
  const query = jest.fn();
  const pool = { query } as unknown as Pool;
  let service: ScheduleVersionService;

  beforeEach(() => {
    query.mockReset();
    service = new ScheduleVersionService(pool);
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
});
