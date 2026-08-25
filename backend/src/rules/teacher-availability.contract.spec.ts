import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("Teacher availability contract", () => {
  it("keeps the versioned API fields and selector dimensions", async () => {
    const schema = JSON.parse(
      await readFile(resolve(__dirname, "../../contracts/schemas/teacher-availability.schema.json"), "utf8"),
    );
    const rule = schema.$defs.teacherAvailabilityRule;

    expect(schema.properties.contractVersion.const).toBe("TEACHER-AVAILABILITY-1.0.0");
    expect(rule.required).toEqual(
      expect.arrayContaining(["strength", "dayOfWeek", "blockedSlotIds", "effectiveFrom", "source"]),
    );
    expect(rule.properties.strength.enum).toEqual(["HARD_UNAVAILABLE", "STRONG_PREFERENCE", "SOFT_WISH"]);
    expect(rule.properties.shiftCode).toBeDefined();
    expect(rule.properties.period).toBeDefined();
  });
});
