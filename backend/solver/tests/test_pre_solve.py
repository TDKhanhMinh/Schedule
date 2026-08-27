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
        self.assertEqual(report.catalogVersion, "CONFLICT-CATALOG-1.0.0")
        self.assertIn("TOTAL_SLOT_CAPACITY_EXCEEDED", {issue.code for issue in report.issues})
        self.assertTrue(report.issues[0].remediationHint)

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

    def test_class_and_room_unavailability_are_specific(self):
        class_report = run_pre_solve_checks(
            request(
                classUnavailableSlotIds={"class-1": ["mon-1", "tue-1"]},
                lessons=[
                    {
                        "id": "lesson-1",
                        "classId": "class-1",
                        "subjectId": "subject-1",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                        "fixedSlotId": "mon-1",
                    }
                ],
            )
        )
        self.assertIn("CLASS_AVAILABILITY_CONFLICT", {issue.code for issue in class_report.issues})

        room_report = run_pre_solve_checks(
            request(
                rooms=[
                    {
                        "id": "room-1",
                        "capabilities": ["STANDARD"],
                        "unavailableSlotIds": ["mon-1", "tue-1"],
                    }
                ]
            )
        )
        self.assertIn("ROOM_AVAILABILITY_CONFLICT", {issue.code for issue in room_report.issues})

    def test_teacher_subject_grade_warning_and_hard_enforcement(self):
        payload = {
            "classGrades": {"class-1": 9},
            "teacherSubjectGradeAssignments": [{"teacherId": "teacher-2", "subjectId": "subject-1", "grade": 9}],
        }
        warning = run_pre_solve_checks(request(**payload, teacherSubjectGradeEnforcement="WARNING"))
        self.assertTrue(warning.canSolve)
        self.assertEqual(warning.warnings, [warning.issues[0].message])
        self.assertEqual(warning.issues[0].code, "TEACHER_SUBJECT_GRADE_NOT_ALLOWED")
        self.assertEqual(warning.issues[0].severity, "WARNING")

        hard = run_pre_solve_checks(request(**payload, teacherSubjectGradeEnforcement="HARD"))
        self.assertFalse(hard.canSolve)
        self.assertEqual(hard.issues[0].code, "TEACHER_SUBJECT_GRADE_NOT_ALLOWED")
        self.assertEqual(hard.issues[0].severity, "ERROR")

    def test_teacher_subject_grade_assignment_allows_matching_class_grade(self):
        report = run_pre_solve_checks(
            request(
                classGrades={"class-1": 9},
                teacherSubjectGradeAssignments=[{"teacherId": "teacher-1", "subjectId": "subject-1", "grade": 9}],
                teacherSubjectGradeEnforcement="HARD",
            )
        )
        self.assertTrue(report.canSolve)
        self.assertNotIn("TEACHER_SUBJECT_GRADE_NOT_ALLOWED", {issue.code for issue in report.issues})


if __name__ == "__main__":
    unittest.main()
