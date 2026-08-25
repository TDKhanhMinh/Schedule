import type { ConfigService } from "@nestjs/config";
import type { SolveJobRequest } from "../contracts";
import { OptimizationPreflightService } from "./optimization-preflight.service";
import { OptimizationQueueService } from "./optimization-queue.service";
import type { OptimizationRunSnapshot } from "./optimization-job.contract";
import type { OptimizationRunStore } from "./optimization-run.store";

const basePayload = {
  schemaVersion: "1.0",
  jobId: "queue-job-001",
  schoolId: "school-001",
  timeSlots: [{ id: "slot-1", day: 1, period: 1 }],
  lessons: [
    {
      id: "lesson-1",
      classId: "class-1",
      subjectId: "subject-1",
      teacherId: "teacher-1",
      requiredSessions: 1,
    },
  ],
} as SolveJobRequest;

const queuedRun: OptimizationRunSnapshot = {
  id: "run-001",
  jobId: "queue-job-001",
  schoolId: "school-001",
  status: "QUEUED",
  inputChecksum: "a".repeat(64),
  outputChecksum: null,
  attempts: 0,
  maxAttempts: 3,
  result: null,
  lastError: null,
  requestedAt: "2026-08-25T00:00:00.000Z",
  startedAt: null,
  completedAt: null,
};

describe("optimization queue producer", () => {
  function createService(overrides: { run?: OptimizationRunSnapshot; canSolve?: boolean } = {}) {
    const add = jest.fn().mockResolvedValue({ id: "queue-job-001" });
    const runStore = {
      createOrGet: jest.fn().mockResolvedValue(overrides.run ?? queuedRun),
    } as unknown as OptimizationRunStore;
    const preflight = {
      check: jest.fn().mockReturnValue({ canSolve: overrides.canSolve ?? true }),
    } as unknown as OptimizationPreflightService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue("redis://localhost:6379"),
      get: jest.fn().mockReturnValue("MVP-0.1.0"),
    } as unknown as ConfigService;
    const service = new OptimizationQueueService(config, preflight, runStore);
    (service as unknown as { getQueue: () => { add: typeof add } }).getQueue = () => ({ add });
    return { service, add, runStore };
  }

  it("creates a versioned adapter envelope and bounded queue options", async () => {
    const { service, add, runStore } = createService();
    const payload = {
      ...basePayload,
      ruleSnapshotId: "snapshot-001",
      ruleSetVersion: "RULE-SET-1.0.0",
      ruleSnapshotHash: "0".repeat(64),
      teacherAvailability: {
        contractVersion: "TEACHER-AVAILABILITY-1.0.0",
        schoolId: "school-001",
        academicPeriodId: "period-001",
        effectiveAsOf: "2026-09-01",
        ruleSnapshotId: "snapshot-001",
        ruleSetVersion: "RULE-SET-1.0.0",
        ruleSnapshotHash: "0".repeat(64),
        rules: [],
      },
    } as unknown as SolveJobRequest;

    const response = await service.enqueue(payload);
    const queuedPayload = add.mock.calls[0][1];
    expect(response).toMatchObject({ runId: "run-001", maxAttempts: 3 });
    expect(queuedPayload.queueContractVersion).toBe("BULLMQ-OPTIMIZATION-1.0.0");
    expect(queuedPayload.solverPayload.adapterContractVersion).toBe("SOLVER-ADAPTER-1.0.0");
    expect(add.mock.calls[0][2]).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 500 } });
    expect(runStore.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({ adapterContractVersion: "SOLVER-ADAPTER-1.0.0", maxAttempts: 3 }),
    );
  });

  it("does not enqueue a completed idempotent run again", async () => {
    const completed = { ...queuedRun, status: "OPTIMAL" as const, result: {} as never, outputChecksum: "b".repeat(64) };
    const { service, add } = createService({ run: completed });

    const response = await service.enqueue(basePayload);

    expect(response.state).toBe("OPTIMAL");
    expect(add).not.toHaveBeenCalled();
  });

  it("does not create a queue record when pre-solve rejects the request", async () => {
    const { service, add, runStore } = createService({ canSolve: false });

    await expect(service.enqueue(basePayload)).rejects.toMatchObject({ response: { code: "PRESOLVE_FAILED" } });
    expect(add).not.toHaveBeenCalled();
    expect(runStore.createOrGet).not.toHaveBeenCalled();
  });
});
