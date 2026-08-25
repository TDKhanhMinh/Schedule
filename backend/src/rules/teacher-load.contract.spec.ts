import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("TeacherLoad contract", () => {
  it("pins the independently versioned report and provenance fields", async () => {
    const schema = JSON.parse(
      await readFile(resolve(__dirname, "../../contracts/schemas/teacher-load-calculation.schema.json"), "utf8"),
    );

    expect(schema.properties.contractVersion.const).toBe("TEACHER-LOAD-1.0.0");
    expect(schema.$defs.teacherLoadCalculation.required).toEqual(
      expect.arrayContaining([
        "weeklyNormSessions",
        "targetAverageWeeklySessions",
        "annualTargetSessions",
        "enforcement",
        "ruleSources",
      ]),
    );
    expect(schema.$defs.teacherLoadSource.required).toEqual(
      expect.arrayContaining(["sourceUrl", "ruleSetVersion", "snapshotHash"]),
    );
  });
});
