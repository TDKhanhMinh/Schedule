import unittest

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.solver import solve


class SolverTest(unittest.TestCase):
    def test_assigns_distinct_slots_for_same_teacher(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-1",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "mon-2", "day": 1, "period": 2},
                ],
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1},
                    {"id": "lesson-b", "classId": "class-7b", "subjectId": "physics", "teacherId": "teacher-1", "requiredSessions": 1},
                ],
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(len(result.assignments), 2)
        self.assertEqual(len({assignment.slotId for assignment in result.assignments}), 2)
        self.assertEqual(result.metadata.contractVersion, "1.0")
        self.assertEqual(result.metadata.randomSeed, 0)
        self.assertEqual(result.metadata.timeLimitSeconds, 10.0)

    def test_reports_infeasible_hard_teacher_conflict(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-infeasible",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1},
                    {"id": "lesson-b", "classId": "class-7b", "subjectId": "physics", "teacherId": "teacher-1", "requiredSessions": 1},
                ],
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertEqual(result.assignments, [])
        self.assertTrue(result.diagnostics.conflicts)
        self.assertEqual(result.metadata.solverVersion, "0.1.0")


if __name__ == "__main__":
    unittest.main()
