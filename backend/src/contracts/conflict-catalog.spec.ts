import {
  CONFLICT_CATALOG,
  CONFLICT_CATALOG_VERSION,
  createConflictChain,
  createConflictDiagnostic,
  getConflictDefinition,
} from "./conflict-catalog";

describe("conflict catalog", () => {
  it("keeps the versioned definitions required by import, pre-solve and solve", () => {
    expect(CONFLICT_CATALOG_VERSION).toBe("CONFLICT-CATALOG-1.0.0");
    expect(CONFLICT_CATALOG.length).toBeGreaterThan(0);
    expect(getConflictDefinition("UNKNOWN_REFERENCE")).toMatchObject({ severity: "ERROR", entity: "IMPORT" });
    expect(getConflictDefinition("TOTAL_SLOT_CAPACITY_EXCEEDED")).toMatchObject({ severity: "ERROR" });
    expect(getConflictDefinition("NO_FEASIBLE_ASSIGNMENT")).toMatchObject({ severity: "ERROR", entity: "JOB" });
    expect(getConflictDefinition("PREFERENCE_VIOLATED")).toMatchObject({ severity: "WARNING" });
  });

  it("creates a safe diagnostic with opaque entity references and a remediation hint", () => {
    expect(createConflictDiagnostic("UNKNOWN_REFERENCE", "Mã giáo viên không tồn tại.", { row: "2" })).toEqual(
      expect.objectContaining({
        catalogVersion: CONFLICT_CATALOG_VERSION,
        code: "UNKNOWN_REFERENCE",
        entity: "IMPORT",
        entityReferences: { row: "2" },
        remediationHint: expect.stringContaining("Dùng đúng mã"),
      }),
    );
  });

  it("creates a deterministic verifiable conflict chain", () => {
    const first = createConflictChain("ROOM_CAPABILITY_UNSATISFIED", "Không có phòng phù hợp.", {
      lessonId: "lesson-1",
      room: "room-1",
    });
    const second = createConflictChain("ROOM_CAPABILITY_UNSATISFIED", "Không có phòng phù hợp.", {
      room: "room-1",
      lessonId: "lesson-1",
    });

    expect(second).toEqual(first);
    expect(first.contractVersion).toBe("CONFLICT-CHAIN-1.0.0");
    expect(first.nodes.some((node) => node.type === "CONSTRAINT")).toBe(true);
    expect(first.nodes.some((node) => node.type === "OUTCOME")).toBe(true);
    expect(first.edges.some((edge) => edge.relation === "RESULTS_IN")).toBe(true);
  });
});
