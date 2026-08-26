import { computeOptimizationChecksum } from "./optimization-checksum";

describe("optimization checksum", () => {
  it("is stable for object key ordering while preserving array order", () => {
    expect(computeOptimizationChecksum({ b: 2, a: 1, ignored: null })).toBe(
      computeOptimizationChecksum({ a: 1, b: 2 }),
    );
    expect(computeOptimizationChecksum({ values: [1, 2] })).not.toBe(computeOptimizationChecksum({ values: [2, 1] }));
  });
});
