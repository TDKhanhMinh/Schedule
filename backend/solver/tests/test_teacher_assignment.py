import unittest

from timetable_solver.teacher_assignment_contracts import TeacherAssignmentRequest
from timetable_solver.teacher_assignment_solver import solve_teacher_assignments


def request_payload():
    return {
        "contractVersion": "TEACHER-ASSIGNMENT-1.0.0",
        "algorithmVersion": "TEACHER-ASSIGNMENT-1.0.0",
        "jobId": "teacher-assignment-test",
        "schoolId": "school-1",
        "academicPeriodId": "period-1",
        "ruleSnapshotId": "snapshot-1",
        "ruleSetVersion": "RULE-SET-1.0.0",
        "ruleSnapshotHash": "0" * 64,
        "randomSeed": 7,
        "options": {"timeLimitSeconds": 30},
        "demands": [
            {"id": "demand-1", "classId": "class-9a", "grade": 9, "subjectId": "math", "requiredSessions": 4},
            {"id": "demand-2", "classId": "class-9b", "grade": 9, "subjectId": "math", "requiredSessions": 4},
        ],
        "teachers": [
            {
                "id": "teacher-1",
                "code": "GV-001",
                "name": "Nguyễn An",
                "assignedWeeklySessions": 0,
                "adjustedWeeklyTarget": 4,
                "hardWeeklyLimitSessions": None,
            },
            {
                "id": "teacher-2",
                "code": "GV-002",
                "name": "Trần Bình",
                "assignedWeeklySessions": 0,
                "adjustedWeeklyTarget": 4,
                "hardWeeklyLimitSessions": None,
            },
        ],
        "eligibility": [
            {"teacherId": "teacher-1", "subjectId": "math", "grade": 9},
            {"teacherId": "teacher-2", "subjectId": "math", "grade": 9},
        ],
        "manualAssignments": [],
    }


class TeacherAssignmentTest(unittest.TestCase):
    def test_balances_load_and_is_deterministic(self):
        request = TeacherAssignmentRequest.model_validate(request_payload())

        first = solve_teacher_assignments(request)
        second = solve_teacher_assignments(request)

        self.assertEqual(first.status, "OPTIMAL")
        self.assertEqual(first.proposals, second.proposals)
        self.assertEqual(first.diagnostics.unassignedDemandIds, second.diagnostics.unassignedDemandIds)
        self.assertEqual(first.metadata, second.metadata)
        self.assertEqual(
            {proposal.teacherId for proposal in first.proposals},
            {"teacher-1", "teacher-2"},
        )
        self.assertEqual(first.diagnostics.unassignedDemandIds, [])

    def test_locked_manual_assignment_is_preserved(self):
        payload = request_payload()
        payload["manualAssignments"] = [
            {"demandId": "demand-1", "teacherId": "teacher-1", "requiredSessions": 4, "locked": True}
        ]
        request = TeacherAssignmentRequest.model_validate(payload)

        result = solve_teacher_assignments(request)

        manual = next(proposal for proposal in result.proposals if proposal.demandId == "demand-1")
        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(manual.teacherId, "teacher-1")
        self.assertEqual(manual.source, "MANUAL")
        self.assertTrue(manual.isLocked)
        self.assertEqual(manual.status, "ACCEPTED")

    def test_missing_eligibility_returns_partial_proposal(self):
        payload = request_payload()
        payload["eligibility"] = [{"teacherId": "teacher-1", "subjectId": "math", "grade": 9}]
        payload["demands"].append(
            {"id": "demand-3", "classId": "class-8a", "grade": 8, "subjectId": "physics", "requiredSessions": 2}
        )
        request = TeacherAssignmentRequest.model_validate(payload)

        result = solve_teacher_assignments(request)

        missing = next(proposal for proposal in result.proposals if proposal.demandId == "demand-3")
        self.assertEqual(result.status, "PARTIAL")
        self.assertEqual(missing.status, "UNASSIGNED")
        self.assertEqual(missing.reasonCode, "NO_ELIGIBLE_TEACHER")
        self.assertEqual(result.diagnostics.unassignedDemandIds, ["demand-3"])

    def test_hard_weekly_limit_can_leave_demand_unassigned(self):
        payload = request_payload()
        payload["teachers"] = [
            {
                "id": "teacher-1",
                "code": "GV-001",
                "name": "Nguyễn An",
                "assignedWeeklySessions": 0,
                "adjustedWeeklyTarget": 4,
                "hardWeeklyLimitSessions": 3,
            }
        ]
        payload["eligibility"] = [{"teacherId": "teacher-1", "subjectId": "math", "grade": 9}]
        payload["demands"] = [payload["demands"][0]]
        request = TeacherAssignmentRequest.model_validate(payload)

        result = solve_teacher_assignments(request)

        self.assertEqual(result.status, "PARTIAL")
        self.assertEqual(result.proposals[0].status, "UNASSIGNED")
        self.assertEqual(result.proposals[0].reasonCode, "NO_FEASIBLE_CAPACITY")

    def test_unlimited_time_limit_is_preserved(self):
        payload = request_payload()
        payload["options"] = {"timeLimitSeconds": None}
        request = TeacherAssignmentRequest.model_validate(payload)

        result = solve_teacher_assignments(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertIsNone(result.metadata.timeLimitSeconds)


if __name__ == "__main__":
    unittest.main()
