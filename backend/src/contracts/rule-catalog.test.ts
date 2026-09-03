import {
  RULE_CATALOG,
  RULE_CATALOG_SCHEMA_VERSION,
  RULE_CATALOG_VERSION,
  assertKnownRuleCode,
  findRuleCatalogEntry,
  isRuleCodeSupported,
  validateRuleCatalog,
} from "./rule-catalog";

describe("Rule Catalog", () => {
  it("has a versioned, unique catalog with valid defaults", () => {
    expect(RULE_CATALOG.catalogVersion).toBe(RULE_CATALOG_VERSION);
    expect(RULE_CATALOG.schemaVersion).toBe(RULE_CATALOG_SCHEMA_VERSION);
    expect(validateRuleCatalog()).toBe(RULE_CATALOG);
    expect(new Set(RULE_CATALOG.ruleTypes.map((entry) => entry.code)).size).toBe(RULE_CATALOG.ruleTypes.length);
  });

  it("resolves legacy availability codes through a registered prefix", () => {
    expect(findRuleCatalogEntry("RULE-TEACHER-AVAILABILITY-001")).toMatchObject({
      code: "RULE-TEACHER-AVAILABILITY",
      implementationStatus: "SUPPORTED",
    });
    expect(isRuleCodeSupported("RULE-TEACHER-AVAILABILITY-001")).toBe(true);
  });

  it("distinguishes registered planned rules from supported handlers", () => {
    expect(assertKnownRuleCode("RULE-SCHEDULE-NO-INTERNAL-GAPS").implementationStatus).toBe("SUPPORTED");
    expect(isRuleCodeSupported("RULE-SCHEDULE-NO-INTERNAL-GAPS")).toBe(true);
    expect(() => assertKnownRuleCode("RULE-UNKNOWN")).toThrow("chưa được đăng ký");
  });
});
