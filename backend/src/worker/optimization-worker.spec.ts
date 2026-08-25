import type { SolveJobResult } from "../contracts";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import { processOptimizationJob } from "./optimization-worker";

const result = {
  schemaVersion: "1.0",
  jobId: "job-001",
  status: "OPTIMAL",
  assignments: [],
  objectiveValue: 0,
  diagnostics: { warnings: [], conflicts: [] },
  metadata: { solverVersion: "0.1.0", contractVersion: "1.0", randomSeed: 0, timeLimitSeconds: 10 },
} as SolveJobResult;

function job(overrides: Partial<OptimizationJobData> = {}, attemptsMade = 0) {
  return {
    attemptsMade,
    opts: { attempts: 3 },
    data: {
      queueContractVersion: "BULLMQ-OPTIMIZATION-1.0.0" as const,
      runId: "run-001",
      request: {} as OptimizationJobData["request"],
      solverPayload: {} as OptimizationJobData["solverPayload"],
      inputChecksum: "a".repeat(64),
      maxAttempts: 3,
      ...overrides,
    },
  };
}

describe("optimization worker boundary", () => {
  it("persists a result and returns checksum provenance", async () => {
    const store = {
      markRunning: jest.fn(),
      markRetryPending: jest.fn(),
      markFailed: jest.fn(),
      persistResult: jest.fn(),
    };

    const processed = await processOptimizationJob(job(), {
      store,
      solve: jest.fn().mockResolvedValue(result),
    });

    expect(store.markRunning).toHaveBeenCalledWith("run-001", 1);
    expect(store.persistResult).toHaveBeenCalledWith("run-001", result, expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(processed.provenance).toEqual({
      runId: "run-001",
      inputChecksum: "a".repeat(64),
      outputChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("records a retryable failure without making it terminal", async () => {
    const error = new Error("python exited");
    const store = {
      markRunning: jest.fn(),
      markRetryPending: jest.fn(),
      markFailed: jest.fn(),
      persistResult: jest.fn(),
    };

    await expect(processOptimizationJob(job(), { store, solve: jest.fn().mockRejectedValue(error) })).rejects.toThrow(
      "python exited",
    );
    expect(store.markRetryPending).toHaveBeenCalledWith("run-001", 1, error);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("records the terminal failure on the bounded final attempt", async () => {
    const error = new Error("python exited");
    const store = {
      markRunning: jest.fn(),
      markRetryPending: jest.fn(),
      markFailed: jest.fn(),
      persistResult: jest.fn(),
    };

    await expect(
      processOptimizationJob(job({}, 2), { store, solve: jest.fn().mockRejectedValue(error) }),
    ).rejects.toThrow("python exited");
    expect(store.markFailed).toHaveBeenCalledWith("run-001", 3, error);
    expect(store.markRetryPending).not.toHaveBeenCalled();
  });
});
