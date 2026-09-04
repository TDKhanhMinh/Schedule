import unittest

from timetable_solver.constraint_audit import audit_hard_constraints
from timetable_solver.contracts import Assignment, SolveJobRequest
from timetable_solver.solver import solve


class SolverTest(unittest.TestCase):
    def test_local_repair_preserves_outside_scope_and_minimizes_affected_moves(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-local-repair",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "mon-2", "day": 1, "period": 2},
                    {"id": "tue-1", "day": 2, "period": 1},
                ],
                "classUnavailableSlotIds": {"class-7a": ["mon-1"]},
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1},
                    {"id": "lesson-b", "classId": "class-7b", "subjectId": "physics", "teacherId": "teacher-1", "requiredSessions": 1},
                ],
                "localRepair": {
                    "contractVersion": "LOCAL-REPAIR-1.0.0",
                    "baselineSnapshotHash": "a" * 64,
                    "baselineAssignments": [
                        {"lessonId": "lesson-a", "sessionIndex": 0, "slotId": "mon-1"},
                        {"lessonId": "lesson-b", "sessionIndex": 0, "slotId": "mon-2"},
                    ],
                    "affectedAssignmentKeys": ["lesson-a:0"],
                    "frozenAssignmentKeys": ["lesson-b:0"],
                },
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual({(item.lessonId, item.slotId) for item in result.assignments}, {("lesson-a", "tue-1"), ("lesson-b", "mon-2")})
        self.assertEqual(result.diagnostics.localRepair.movedAssignmentCount, 1)
        self.assertEqual(result.diagnostics.localRepair.preservedAssignmentCount, 0)
        self.assertTrue(result.diagnostics.localRepair.outsideScopeUnchanged)

    def test_local_repair_freeze_is_hard_and_incomplete_baseline_is_diagnostic(self):
        base = {
            "schemaVersion": "1.0",
            "jobId": "job-local-repair-invalid",
            "schoolId": "school-1",
            "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}, {"id": "tue-1", "day": 2, "period": 1}],
            "classUnavailableSlotIds": {"class-7a": ["mon-1"]},
            "lessons": [{"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}],
            "localRepair": {
                "contractVersion": "LOCAL-REPAIR-1.0.0",
                "baselineSnapshotHash": "b" * 64,
                "baselineAssignments": [{"lessonId": "lesson-a", "sessionIndex": 0, "slotId": "mon-1"}],
                "affectedAssignmentKeys": ["lesson-a:0"],
                "frozenAssignmentKeys": ["lesson-a:0"],
            },
        }
        frozen_result = solve(SolveJobRequest.model_validate(base))
        self.assertEqual(frozen_result.status, "INFEASIBLE")

        incomplete = {**base, "jobId": "job-local-repair-incomplete", "localRepair": {**base["localRepair"], "baselineAssignments": []}}
        with self.assertRaises(ValueError):
            SolveJobRequest.model_validate(incomplete)

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

    def test_explicit_unlimited_time_limit_is_preserved(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-unlimited-time-limit",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "lessons": [
                    {
                        "id": "lesson-a",
                        "classId": "class-7a",
                        "subjectId": "math",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                    }
                ],
                "options": {"timeLimitSeconds": None},
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertIsNone(result.metadata.timeLimitSeconds)

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

    def test_locked_assignment_is_hard_fixed_by_solver(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-locked-assignment",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "tue-1", "day": 2, "period": 1},
                ],
                "lessons": [
                    {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}
                ],
                "lockedAssignments": {
                    "contractVersion": "LOCKED-ASSIGNMENTS-1.0.0",
                    "assignments": [
                        {
                            "lessonId": "lesson-a",
                            "sessionIndex": 0,
                            "slotId": "tue-1",
                            "scope": "LESSON",
                            "scopeId": "lesson-a",
                        }
                    ],
                },
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual([(item.lessonId, item.sessionIndex, item.slotId) for item in result.assignments], [("lesson-a", 0, "tue-1")])

    def test_locked_assignment_contract_rejects_duplicate_occurrence(self):
        with self.assertRaises(ValueError):
            SolveJobRequest.model_validate(
                {
                    "schemaVersion": "1.0",
                    "jobId": "job-duplicate-lock",
                    "schoolId": "school-1",
                    "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                    "lessons": [
                        {"id": "lesson-a", "classId": "class-7a", "subjectId": "math", "teacherId": "teacher-1", "requiredSessions": 1}
                    ],
                    "lockedAssignments": {
                        "contractVersion": "LOCKED-ASSIGNMENTS-1.0.0",
                        "assignments": [
                            {"lessonId": "lesson-a", "sessionIndex": 0, "slotId": "mon-1", "scope": "LESSON", "scopeId": "lesson-a"},
                            {"lessonId": "lesson-a", "sessionIndex": 0, "slotId": "mon-1", "scope": "LESSON", "scopeId": "lesson-a"},
                        ],
                    },
                }
            )

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
                            "shiftCode": "MORNING",
                            "blockedSlotIds": [],
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

    def test_class_unavailability_prunes_non_fixed_slot(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-class-unavailable",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "tue-1", "day": 2, "period": 1},
                ],
                "classUnavailableSlotIds": {"class-7a": ["mon-1"]},
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

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].slotId, "tue-1")
        self.assertEqual(result.diagnostics.modelMetrics.domainPrunedCount, 1)

    def test_fixed_slot_conflict_with_class_unavailability_is_diagnostic(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-fixed-class-conflict",
                "schoolId": "school-1",
                "timeSlots": [{"id": "mon-1", "day": 1, "period": 1}],
                "classUnavailableSlotIds": {"class-7a": ["mon-1"]},
                "lessons": [
                    {
                        "id": "lesson-a",
                        "classId": "class-7a",
                        "subjectId": "math",
                        "teacherId": "teacher-1",
                        "requiredSessions": 1,
                        "fixedSlotId": "mon-1",
                    }
                ],
            }
        )

        result = solve(request)

        self.assertEqual(result.status, "INFEASIBLE")
        self.assertTrue(any("CLASS_AVAILABILITY_CONFLICT" in conflict for conflict in result.diagnostics.conflicts))

    def test_room_unavailability_prunes_room_slot_pair(self):
        request = SolveJobRequest.model_validate(
            {
                "schemaVersion": "1.0",
                "jobId": "job-room-unavailable",
                "schoolId": "school-1",
                "timeSlots": [
                    {"id": "mon-1", "day": 1, "period": 1},
                    {"id": "tue-1", "day": 2, "period": 1},
                ],
                "rooms": [
                    {
                        "id": "room-1",
                        "capabilities": ["STANDARD"],
                        "unavailableSlotIds": ["mon-1"],
                    }
                ],
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

        result = solve(request)

        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.assignments[0].slotId, "tue-1")
        self.assertEqual(result.assignments[0].roomId, "room-1")
        self.assertEqual(result.diagnostics.modelMetrics.domainPrunedCount, 1)

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

    def test_versioned_weighted_objective_changes_preference_choice_and_breakdown(self):
        base = {
            "schemaVersion": "1.0",
            "schoolId": "school-1",
            "timeSlots": [
                {"id": "mon-1", "day": 1, "period": 1},
                {"id": "tue-1", "day": 2, "period": 1},
            ],
            "lessons": [
                {
                    "id": "lesson-a",
                    "classId": "class-7a",
                    "subjectId": "math",
                    "teacherId": "teacher-1",
                    "requiredSessions": 1,
                }
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
                        "ruleId": "availability-soft",
                        "code": "RULE-TEACHER-AVAILABILITY-SOFT",
                        "teacherId": "teacher-1",
                        "strength": "SOFT_WISH",
                        "weight": 1,
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
        objective = {
            "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
            "weights": {
                "teacherGap": 0,
                "compactness": 0,
                "dayDistribution": 0,
                "undesirableSlots": 1,
                "preferredDays": 0,
                "fairness": 0,
            },
        }

        weighted = solve(
            SolveJobRequest.model_validate({**base, "jobId": "job-weighted", "objective": objective})
        )
        unweighted = solve(
            SolveJobRequest.model_validate(
                {
                    **base,
                    "jobId": "job-unweighted",
                    "objective": {
                        "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
                        "weights": {group: 0 for group in objective["weights"]},
                    },
                }
            )
        )

        self.assertEqual(weighted.status, "OPTIMAL")
        self.assertEqual(weighted.assignments[0].slotId, "tue-1")
        self.assertEqual(weighted.metadata.objectiveContractVersion, "SOLVER-OBJECTIVE-1.0.0")
        self.assertEqual(weighted.diagnostics.objectiveBreakdown.undesirableSlots, 0)
        self.assertEqual(weighted.diagnostics.objectiveBreakdown.weightedTotal, 0)
        self.assertEqual(unweighted.assignments[0].slotId, "mon-1")
        self.assertEqual(unweighted.diagnostics.objectiveBreakdown.undesirableSlots, 1000)


if __name__ == "__main__":
    unittest.main()
