import unittest

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.relaxation import RELAXATION_CONTRACT_VERSION, build_relaxation_proposals


class RelaxationTest(unittest.TestCase):
    def test_ranked_proposals_are_deterministic_and_never_auto_relax_hard_rules(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-relaxation",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1},
                    {"id": "lesson-b", "classId": "class-7b", "subjectId": "physics", "teacherId": "teacher-1", "requiredSessions": 1},
                ],
                "teacherAvailability": {
                    "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
                    "schoolId": "school-1",
                    "academicPeriodId": "period-1",
                    "effectiveAsOf": "2026-09-01",
                    "ruleSnapshotId": "snapshot-1",
                    "ruleSetVersion": "RULE-SET-1.0.0",
                    "ruleSnapshotHash": "a" * 64,
                    "rules": [
                        {
                            "ruleId": "soft-1",
                            "code": "RULE-SOFT-DAY",
                            "teacherId": "teacher-1",
                            "strength": "SOFT_WISH",
                            "weight": 0.5,
                            "dayOfWeek": 1,
                            "blockedSlotIds": [],
                            "effectiveFrom": "2026-09-01",
                            "source": {
                                "sourceUrl": "https://schedule.local/rules/soft-1",
                                "ruleSnapshotId": "snapshot-1",
                                "ruleSetVersion": "RULE-SET-1.0.0",
                                "ruleSnapshotHash": "a" * 64,
                            },
                        },
                        {
                            "ruleId": "hard-1",
                            "code": "RULE-HARD-UNAVAILABLE",
                            "teacherId": "teacher-1",
                            "strength": "HARD_UNAVAILABLE",
                            "weight": None,
                            "dayOfWeek": 1,
                            "blockedSlotIds": ["mon-1"],
                            "effectiveFrom": "2026-09-01",
                            "source": {
                                "sourceUrl": "https://schedule.local/rules/hard-1",
                                "ruleSnapshotId": "snapshot-1",
                                "ruleSetVersion": "RULE-SET-1.0.0",
                                "ruleSnapshotHash": "a" * 64,
                            },
                        },
                    ],
                },
            }
        )

        first = build_relaxation_proposals(request, ["HARD_AVAILABILITY_CONFLICT", "TEACHER_SLOT_CAPACITY_EXCEEDED"])
        second = build_relaxation_proposals(request, ["TEACHER_SLOT_CAPACITY_EXCEEDED", "HARD_AVAILABILITY_CONFLICT"])

        self.assertEqual(first, second)
        self.assertTrue(first)
        self.assertTrue(all(item["requiresApproval"] and not item["autoApply"] for item in first))
        self.assertTrue(any(item["kind"] == "SOFT_RULE_WEIGHT" for item in first))
        self.assertTrue(any(item["hardRuleProtected"] for item in first))
        self.assertEqual([item["rank"] for item in first], list(range(1, len(first) + 1)))
        self.assertEqual(RELAXATION_CONTRACT_VERSION, "RELAXATION-PROPOSAL-1.0.0")


if __name__ == "__main__":
    unittest.main()
