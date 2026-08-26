import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildSolverAdapterPayload,
  SOLVER_ADAPTER_CONTRACT_VERSION,
  validateSolverAdapterPayload,
  verifySolverAdapterChecksum,
  type SolverAdapterPayload,
  type SolveJobRequest,
} from "./index";

async function readFixture() {
  return JSON.parse(
    await readFile(resolve(__dirname, "../../contracts/examples/solver-adapter.json"), "utf8"),
  ) as SolverAdapterPayload;
}

describe("solver adapter contract", () => {
  it("round-trips the published fixture and preserves reproducibility metadata", async () => {
    const fixture = await readFixture();
    const payload = validateSolverAdapterPayload(fixture);

    expect(payload.adapterContractVersion).toBe(SOLVER_ADAPTER_CONTRACT_VERSION);
    expect(verifySolverAdapterChecksum(payload)).toBe(true);
    expect(payload.source.templateVersion).toBe("MVP-0.1.0");
    expect(payload.reproducibility).toEqual({ randomSeed: 7, timeLimitSeconds: 10 });
    expect(payload.input.teacherAvailability?.rules).toHaveLength(2);
  });

  it("builds a deterministic checksum and rejects changed input", async () => {
    const fixture = await readFixture();
    const built = buildSolverAdapterPayload(fixture.input, {
      academicPeriodId: fixture.source.academicPeriodId,
      templateVersion: fixture.source.templateVersion,
      randomSeed: fixture.reproducibility.randomSeed,
      timeLimitSeconds: fixture.reproducibility.timeLimitSeconds,
    });
    expect(built.inputChecksum).toBe(fixture.inputChecksum);

    const changed = {
      ...built,
      input: { ...built.input, jobId: "changed-job" },
    } as SolverAdapterPayload;
    expect(verifySolverAdapterChecksum(changed)).toBe(false);
    expect(() => validateSolverAdapterPayload(changed)).toThrow("inputChecksum");
  });

  it("requires an approved rule snapshot reference", async () => {
    const fixture = await readFixture();
    const input = { ...fixture.input, ruleSnapshotHash: undefined } as unknown as SolveJobRequest;
    expect(() =>
      buildSolverAdapterPayload(input, {
        academicPeriodId: fixture.source.academicPeriodId,
        templateVersion: fixture.source.templateVersion,
      }),
    ).toThrow("approved rule snapshot");
  });
});
