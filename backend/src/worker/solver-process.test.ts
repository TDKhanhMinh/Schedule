import { runPythonSolver } from "./solver-process";
import type { SolveJobRequest } from "../contracts";

describe("solver process lifecycle", () => {
  it("rejects an already-aborted run without starting Python", async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = runPythonSolver({} as unknown as SolveJobRequest, { signal: controller.signal });

    await expect(promise).rejects.toEqual(expect.objectContaining({ code: "SOLVER_CANCELLED" }));
  });
});
