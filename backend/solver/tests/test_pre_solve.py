import unittest

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.pre_solve import run_pre_solve_checks


def request(**overrides):
    payload = {
        "schemaVersion": "1.0",
        "jobId": "job-preflight",
        "schoolId": "school-001",
        "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}, {"id": "tue-1", "day": 2, "period": 1}],
        "lessons": [
            {"id": "lesson-1", "classId": "class-1", "subjectId": "subject-1", "teacherId": "teacher-1", "requiredSessions": 1}
        ],
    }
    payload.update(overrides)
    return SolveJobRequest.model_validate(payload)


class PreSolveTest(unittest.TestCase):
    def test_total_demand_and_class_capacity_are_reported(self):
        report = run_pre_solve_checks(
            request(
                lessons=[
                    {"id": "lesson-1", "classId": "class-1", "subjectId": "subject-1", "teacherId": "teacher-1", "requiredSessions": 3},
                    {"id": "lesson-2", "classId": "class-2", "subjectId": "subject-2", "teacherId": "teacher-2", "requiredSessions": 2},
                ]
            )
        )
        self.assertFalse(report.canSolve)
        self.assertIn("TOTAL_SLOT_CAPACITY_EXCEEDED", {issue.code for issue in report.issues})

    def test_hard_teacher_availability_and_room_capability_are_checked(self):
        report = run_pre_solve_checks(
            request(
                teacherAvailability={
                    "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
                    "schoolId": "school-001",
                    "academicPeriodId": "period-001",
                    "effectiveAsOf": "2026-09-01",
                    "ruleSnapshotId": "snapshot-001",
                    "ruleSetVersion": "RULE-SET-1.0.0",
                    "ruleSnapshotHash": "0" * 64,
                    "rules": [
                        {
                            "ruleId": "availability-1",
                            "code": "RULE-TEACHER-AVAILABILITY-001",
                            "teacherId": "teacher-1",
                            "strength": "HARD_UNAVAILABLE",
                            "weight": None,
                            "dayOfWeek": 1,
                            "blockedSlotIds": ["mon-1"],
                            "effectiveFrom": "2026-09-01",
                            "source": {
                                "sourceUrl": "https://schedule.local/rules",
                                "ruleSnapshotId": "snapshot-001",
                                "ruleSetVersion": "RULE-SET-1.0.0",
                                "ruleSnapshotHash": "0" * 64,
                            },
                        }
                    ],
                },
                lessons=[
                    {
                        "id": "lesson-1",
                        "classId": "class-1",
                        "subjectId": "subject-1",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                        "requiredRoomCapabilities": ["LAB"],
                    }
                ],
                rooms=[{"id": "room-1", "capabilities": ["STANDARD"]}],
            )
        )
        self.assertFalse(report.canSolve)
        self.assertIn("ROOM_CAPABILITY_UNSATISFIED", {issue.code for issue in report.issues})

    def test_valid_request_passes_and_fixed_conflict_is_specific(self):
        self.assertTrue(run_pre_solve_checks(request()).canSolve)
        report = run_pre_solve_checks(
            request(
                lessons=[
                    {"id": "lesson-1", "classId": "class-1", "subjectId": "subject-1", "teacherId": "teacher-1", "requiredSessions": 1, "fixedSlotId": "mon-1"},
                    {"id": "lesson-2", "classId": "class-2", "subjectId": "subject-2", "teacherId": "teacher-1", "requiredSessions": 1, "fixedSlotId": "mon-1"},
                ]
            )
        )
        self.assertIn("FIXED_RESOURCE_CONFLICT", {issue.code for issue in report.issues})


if __name__ == "__main__":
    unittest.main()
