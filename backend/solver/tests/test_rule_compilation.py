import unittest

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.solver import solve


def rule(code, kind, scope, parameters, weight=None):
    return {
        "code": code,
        "kind": kind,
        "weight": weight,
        "sourceUrl": "https://schedule.local/rules",
        "sourceLocator": "P2.1-T11-test",
        "effectiveFrom": "2026-09-01",
        "effectiveTo": None,
        "scope": scope,
        "approvalState": "APPROVED",
        "approvedBy": "reviewer-1",
        "approvedAt": "2026-08-28T00:00:00.000Z",
        "approvalReason": "Test rule",
        "parameters": parameters,
    }


def base_request(time_slots, lessons, rules):
    return SolveJobRequest.model_validate(
        {
            "schemaVersion": "1.0",
            "jobId": "rule-compilation-test",
            "schoolId": "school-1",
            "timeSlots": time_slots,
            "lessons": lessons,
            "ruleDefinitions": rules,
        }
    )


class RuleCompilationTest(unittest.TestCase):
    def test_preferred_off_days_are_soft_and_avoid_requested_days(self):
        request = base_request(
            [
                {"id": "mon-1", "day": 1, "period": 1, "shiftCode": "MORNING"},
                {"id": "tue-1", "day": 2, "period": 1, "shiftCode": "MORNING"},
            ],
            [{"id": "lesson-1", "classId": "class-1", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}],
            [
                rule(
                    "RULE-TEACHER-PREFERRED-OFF-DAYS",
                    "SOFT",
                    {"resourceType": "TEACHER", "resourceIds": ["teacher-1"]},
                    {"daysOfWeek": [1]},
                    10,
                )
            ],
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].slotId, "tue-1")
        self.assertEqual(result.diagnostics.objectiveBreakdown.preferredDays, 0)

    def test_max_working_days_is_hard(self):
        request = base_request(
            [
                {"id": "mon-1", "day": 1, "period": 1},
                {"id": "tue-1", "day": 2, "period": 1},
            ],
            [
                {"id": "lesson-1", "classId": "class-1", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1},
                {"id": "lesson-2", "classId": "class-2", "subjectId": "physics", "teacherId": "teacher-1", "requiredSessions": 1},
            ],
            [
                rule(
                    "RULE-TEACHER-MAX-WORKING-DAYS",
                    "HARD",
                    {"resourceType": "TEACHER", "resourceIds": ["teacher-1"]},
                    {"maxDays": 1},
                )
            ],
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")

    def test_hard_no_internal_gaps_rejects_forced_gap(self):
        request = base_request(
            [
                {"id": "mon-1", "day": 1, "period": 1, "shiftCode": "MORNING"},
                {"id": "mon-2", "day": 1, "period": 2, "shiftCode": "MORNING"},
                {"id": "mon-3", "day": 1, "period": 3, "shiftCode": "MORNING"},
            ],
            [
                {"id": "lesson-1", "classId": "class-1", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1, "allowedSlotIds": ["mon-1"]},
                {"id": "lesson-2", "classId": "class-1", "subjectId": "physics", "teacherId": "teacher-2", "requiredSessions": 1, "allowedSlotIds": ["mon-3"]},
            ],
            [
                rule(
                    "RULE-SCHEDULE-NO-INTERNAL-GAPS",
                    "HARD",
                    {"resourceType": "CLASS", "resourceIds": ["class-1"]},
                    {"granularity": "DAY_SHIFT"},
                )
            ],
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertTrue(result.diagnostics.preSolve.canSolve)

    def test_soft_no_internal_gaps_reports_compactness_penalty(self):
        request = base_request(
            [
                {"id": "mon-1", "day": 1, "period": 1, "shiftCode": "MORNING"},
                {"id": "mon-2", "day": 1, "period": 2, "shiftCode": "MORNING"},
                {"id": "mon-3", "day": 1, "period": 3, "shiftCode": "MORNING"},
            ],
            [
                {"id": "lesson-1", "classId": "class-1", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1, "allowedSlotIds": ["mon-1"]},
                {"id": "lesson-2", "classId": "class-1", "subjectId": "physics", "teacherId": "teacher-2", "requiredSessions": 1, "allowedSlotIds": ["mon-3"]},
            ],
            [
                rule(
                    "RULE-SCHEDULE-NO-INTERNAL-GAPS",
                    "SOFT",
                    {"resourceType": "CLASS", "resourceIds": ["class-1"]},
                    {"granularity": "DAY_SHIFT"},
                    5,
                )
            ],
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertGreater(result.diagnostics.objectiveBreakdown.compactness, 0)

    def test_unknown_rule_is_rejected_before_cp_sat(self):
        request = base_request(
            [{"id": "mon-1", "day": 1, "period": 1}],
            [{"id": "lesson-1", "classId": "class-1", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}],
            [rule("RULE-UNKNOWN", "HARD", {"resourceType": "CLASS", "resourceIds": ["class-1"]}, {})],
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertEqual(result.diagnostics.preSolve.issues[-1].code, "UNKNOWN_RULE_CODE")


if __name__ == "__main__":
    unittest.main()
