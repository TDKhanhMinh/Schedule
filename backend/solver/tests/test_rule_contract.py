import unittest
import json
from datetime import date
from pathlib import Path

from timetable_solver.rule_contract import (
    RuleSetSnapshot,
    compute_rule_set_snapshot_hash,
    get_effective_rules,
)


def snapshot_payload() -> dict:
    fixture = Path(__file__).parents[2] / "contracts" / "examples" / "rule-set-snapshot.json"
    return json.loads(fixture.read_text(encoding="utf-8"))


class RuleContractTest(unittest.TestCase):
    def test_snapshot_hash_and_effective_rules_are_deterministic(self):
        snapshot = RuleSetSnapshot.model_validate(snapshot_payload())
        self.assertEqual(
            compute_rule_set_snapshot_hash(snapshot),
            "fe37e38f9db500a756e617da9db920eb57f6b74cfabb92b1c3973391b5639518",
        )
        self.assertEqual(
            [rule.code for rule in get_effective_rules(snapshot, date(2025, 6, 1))],
            ["RULE-EDU-001", "RULE-SCHOOL-002"],
        )
        self.assertEqual(
            [rule.code for rule in get_effective_rules(snapshot, date(2026, 1, 1))],
            ["RULE-EDU-001"],
        )

    def test_unapproved_snapshot_has_no_effective_rules(self):
        payload = snapshot_payload()
        payload["approvalState"] = "PENDING_STAKEHOLDER"
        snapshot = RuleSetSnapshot.model_validate(payload)
        self.assertEqual(get_effective_rules(snapshot, date(2025, 6, 1)), [])

    def test_soft_rule_requires_weight_and_approved_metadata(self):
        payload = snapshot_payload()
        payload["rules"][1]["weight"] = None
        with self.assertRaises(ValueError):
            RuleSetSnapshot.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
