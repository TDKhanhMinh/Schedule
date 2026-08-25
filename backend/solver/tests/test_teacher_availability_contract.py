import json
import unittest
from pathlib import Path

from pydantic import ValidationError

from timetable_solver.teacher_availability import TeacherAvailabilitySet


FIXTURE = Path(__file__).resolve().parents[2] / "contracts/examples/teacher-availability.json"


class TeacherAvailabilityContractTest(unittest.TestCase):
    def test_shared_fixture_round_trips(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        contract = TeacherAvailabilitySet.model_validate(payload)

        self.assertEqual(contract.contractVersion, "TEACHER-AVAILABILITY-1.0.0")
        self.assertEqual(contract.rules[0].strength, "HARD_UNAVAILABLE")
        self.assertEqual(contract.rules[0].blockedSlotIds, ["mon-morning-1", "mon-morning-2"])

    def test_hard_weight_and_snapshot_provenance_are_rejected(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payload["rules"][0]["weight"] = 1
        with self.assertRaises(ValidationError):
            TeacherAvailabilitySet.model_validate(payload)

        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payload["rules"][0]["source"]["ruleSnapshotHash"] = "1" * 64
        with self.assertRaises(ValidationError):
            TeacherAvailabilitySet.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
