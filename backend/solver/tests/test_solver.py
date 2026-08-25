import unittest

from timetable_solver.constraint_audit import audit_hard_constraints
from timetable_solver.contracts import Assignment, SolveJobRequest
from timetable_solver.solver import solve


class SolverTest(unittest.TestCase):
    def test_assigns_distinct_slots_for_same_teacher(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-1",
                "schoolId": "school-1",
                "ruleSnapshotId": "snapshot-001",
                "ruleSetVersion": "RULE-SET-1.0.0",
                "ruleSnapshotHash": "0" * 64,
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
        self.assertEqual(result.metadata.ruleSnapshotId, "snapshot-001")
        self.assertEqual(result.metadata.ruleSetVersion, "RULE-SET-1.0.0")
        self.assertEqual(result.metadata.ruleSnapshotHash, "0" * 64)
        self.assertEqual(result.diagnostics.hardConstraintViolations, [])

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
        self.assertEqual(result.diagnostics.catalogVersion, "CONFLICT-CATALOG-1.0.0")
        self.assertTrue(result.diagnostics.conflictDetails)
        self.assertEqual(result.metadata.solverVersion, "0.1.0")

    def test_hard_teacher_unavailable_is_never_assigned(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-availability-hard",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1, "shiftCode": "MORNING"},
                    {"id": "tue-1", "day": 2, "period": 1, "shiftCode": "MORNING"},
                ],
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}
                ],
                "teacherAvailability": {
                    "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
                    "schoolId": "school-1",
                    "academicPeriodId": "period-1",
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
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].slotId, "tue-1")

    def test_builds_lesson_slot_room_variables_and_prunes_ineligible_rooms(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-room-domain",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "mon-2", "day": 1, "period": 2},
                ],
                "rooms": [
                    {"id": "room-lab", "capabilities": ["LAB"]},
                    {"id": "room-standard", "capabilities": ["STANDARD"]},
                ],
                "lessons": [
                    {
                        "id": "lesson-lab",
                        "classId": "class-7a",
                        "subjectId": "science",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                        "allowedRoomIds": ["room-lab"],
                        "requiredRoomCapabilities": ["LAB"],
                    }
                ],
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].roomId, "room-lab")
        self.assertEqual(result.diagnostics.modelMetrics.variableCount, 2)
        self.assertEqual(result.diagnostics.modelMetrics.candidatePairCount, 2)
        self.assertEqual(result.diagnostics.modelMetrics.roomDomainCount, 1)
        self.assertEqual(result.diagnostics.modelMetrics.domainPrunedCount, 2)
        self.assertEqual(result.diagnostics.hardConstraintViolations, [])

    def test_enforces_room_occupancy_as_hard_constraint(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-room-conflict",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "rooms": [{"id": "room-1", "capabilities": ["STANDARD"]}],
                "lessons": [
                    {
                        "id": "lesson-a",
                        "classId": "class-7a",
                        "subjectId": "math",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                    },
                    {
                        "id": "lesson-b",
                        "classId": "class-7b",
                        "subjectId": "physics",
                        "teacherId": "teacher-2",
                        "requiredSessions": 1,
                    },
                ],
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertEqual(result.diagnostics.modelMetrics.variableCount, 2)
        self.assertEqual(result.diagnostics.modelMetrics.candidatePairCount, 2)
        self.assertEqual(result.diagnostics.conflictDetails[0].code, "NO_FEASIBLE_ASSIGNMENT")

    def test_audit_rejects_duplicate_occurrence_and_resource_overlap(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-audit",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "rooms": [{"id": "room-1", "capabilities": ["STANDARD"]}],
                "lessons": [
                    {
                        "id": "lesson-a",
                        "classId": "class-7a",
                        "subjectId": "math",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                    }
                ],
            }
        )
        assignment = Assignment(
            lessonId="lesson-a",
            sessionIndex=0,
            slotId="mon-1",
            roomId="room-1",
        )

        violations = audit_hard_constraints(request, [assignment, assignment])

        self.assertTrue(any(violation.startswith("EXACT_DEMAND_VIOLATION") for violation in violations))
        self.assertTrue(any(violation.startswith("CLASS_OVERLAP") for violation in violations))
        self.assertTrue(any(violation.startswith("TEACHER_OVERLAP") for violation in violations))
        self.assertTrue(any(violation.startswith("ROOM_OVERLAP") for violation in violations))

    def test_strong_preference_is_avoided_and_soft_wish_can_be_violated(self):
        base = {
            "schemaVersion": "1.0",
            "schoolId": "school-1",
            "timeSlots": [
                {"id": "mon-1", "day": 1, "period": 1},
                {"id": "tue-1", "day": 2, "period": 1},
            ],
            "lessons": [
                {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}
            ],
            "teacherAvailability": {
                "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
                "schoolId": "school-1",
                "academicPeriodId": "period-1",
                "effectiveAsOf": "2026-09-01",
                "ruleSnapshotId": "snapshot-001",
                "ruleSetVersion": "RULE-SET-1.0.0",
                "ruleSnapshotHash": "0" * 64,
                "rules": [
                    {
                        "ruleId": "availability-strong",
                        "code": "RULE-TEACHER-AVAILABILITY-STRONG",
                        "teacherId": "teacher-1",
                        "strength": "STRONG_PREFERENCE",
                        "weight": 10,
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
        }

        result = solve(SolveJobRequest.model_validate({**base, "jobId": "job-availability-strong"}))

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].slotId, "tue-1")
        self.assertEqual(result.diagnostics.warnings, [])

        base["timeSlots"] = [{"id": "mon-1", "day": 1, "period": 1}]
        base["teacherAvailability"]["rules"][0]["strength"] = "SOFT_WISH"
        base["teacherAvailability"]["rules"][0]["weight"] = 1
        base["teacherAvailability"]["rules"][0]["code"] = "RULE-TEACHER-AVAILABILITY-SOFT"
        result = solve(SolveJobRequest.model_validate({**base, "jobId": "job-availability-soft"}))

        self.assertEqual(result.status, "OPTIMAL")
        self.assertTrue(any("PREFERENCE_VIOLATED:RULE-TEACHER-AVAILABILITY-SOFT" in warning for warning in result.diagnostics.warnings))
        self.assertEqual(result.diagnostics.conflictDetails[0].code, "PREFERENCE_VIOLATED")


if __name__ == "__main__":
    unittest.main()
