import unittest

from timetable_solver.rule_catalog import (
    RULE_CATALOG,
    RULE_CATALOG_SCHEMA_VERSION,
    RULE_CATALOG_VERSION,
    find_rule_catalog_entry,
    is_rule_code_supported,
)


class RuleCatalogTest(unittest.TestCase):
    def test_catalog_is_versioned_and_unique(self):
        self.assertEqual(RULE_CATALOG.catalogVersion, RULE_CATALOG_VERSION)
        self.assertEqual(RULE_CATALOG.schemaVersion, RULE_CATALOG_SCHEMA_VERSION)
        codes = [entry.code for entry in RULE_CATALOG.ruleTypes]
        self.assertEqual(len(codes), len(set(codes)))
        for entry in RULE_CATALOG.ruleTypes:
            self.assertIn(entry.defaultKind, entry.supportedKinds)
            if entry.defaultKind == "SOFT":
                self.assertIsNotNone(entry.defaultWeight)

    def test_legacy_availability_prefix_and_planned_rule_are_distinct(self):
        availability = find_rule_catalog_entry("RULE-TEACHER-AVAILABILITY-001")
        self.assertIsNotNone(availability)
        self.assertEqual(availability.implementationStatus, "SUPPORTED")
        self.assertTrue(is_rule_code_supported("RULE-TEACHER-AVAILABILITY-001"))
        self.assertTrue(is_rule_code_supported("RULE-SCHEDULE-NO-INTERNAL-GAPS"))
        self.assertIsNone(find_rule_catalog_entry("RULE-UNKNOWN"))


if __name__ == "__main__":
    unittest.main()
