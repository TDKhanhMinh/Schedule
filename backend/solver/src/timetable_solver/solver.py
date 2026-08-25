from ortools.sat.python import cp_model

from .conflict_catalog import CONFLICT_CATALOG_VERSION, conflict_diagnostic
from .contracts import (
    Assignment,
    CONTRACT_VERSION,
    DEFAULT_TIME_LIMIT_SECONDS,
    SOLVER_VERSION,
    SolveJobRequest,
    SolveJobResult,
)
from .teacher_availability import TeacherAvailabilityRule
from .pre_solve import run_pre_solve_checks
from .solver_adapter import SolverAdapterPayload


def _build_metadata(
    request: SolveJobRequest,
    random_seed: int,
    time_limit_seconds: float,
    adapter_payload: SolverAdapterPayload | None,
) -> dict[str, object]:
    metadata: dict[str, object] = {
        "solverVersion": SOLVER_VERSION,
        "contractVersion": CONTRACT_VERSION,
        "randomSeed": random_seed,
        "timeLimitSeconds": time_limit_seconds,
        "ruleSnapshotId": request.ruleSnapshotId,
        "ruleSetVersion": request.ruleSetVersion,
        "ruleSnapshotHash": request.ruleSnapshotHash,
    }
    if adapter_payload:
        metadata.update(
            {
                "adapterContractVersion": adapter_payload.adapterContractVersion,
                "templateVersion": adapter_payload.source.templateVersion,
                "academicPeriodId": adapter_payload.source.academicPeriodId,
                "inputChecksum": adapter_payload.inputChecksum,
            }
        )
    return metadata


def _active_availability_rules(request) -> list[TeacherAvailabilityRule]:
    availability = request.teacherAvailability
    if availability is None:
        return []
    return [
        rule
        for rule in availability.rules
        if rule.effectiveFrom <= availability.effectiveAsOf
        and (rule.effectiveTo is None or availability.effectiveAsOf <= rule.effectiveTo)
    ]


def _rule_matches_slot(rule: TeacherAvailabilityRule, slot) -> bool:
    if slot.id in rule.blockedSlotIds:
        return True
    if rule.dayOfWeek != slot.day:
        return False
    if rule.shiftCode and rule.shiftCode != slot.shiftCode:
        return False
    if rule.period and rule.period != slot.period:
        return False
    return True


def _availability_penalty(rule: TeacherAvailabilityRule) -> int:
    # Keep the wire weight auditable while making STRONG preferences outrank
    # ordinary wishes when both cannot be satisfied.
    multiplier = 10 if rule.strength == "STRONG_PREFERENCE" else 1
    return max(0, round((rule.weight or 0) * 1000 * multiplier))


def solve(
    request: SolveJobRequest,
    *,
    random_seed: int = 0,
    adapter_payload: SolverAdapterPayload | None = None,
) -> SolveJobResult:
    pre_solve = run_pre_solve_checks(request)
    if not pre_solve.canSolve:
        pre_solve_conflicts = [f"{issue.code}: {issue.message}" for issue in pre_solve.issues]
        conflict_details = [
            conflict_diagnostic(issue.code, issue.message, issue.entityReferences, issue.severity)
            for issue in pre_solve.issues
        ]
        if "No feasible assignment satisfies all hard class and teacher constraints" not in pre_solve_conflicts:
            pre_solve_conflicts.append("No feasible assignment satisfies all hard class and teacher constraints")
            conflict_details.append(
                conflict_diagnostic(
                    "NO_FEASIBLE_ASSIGNMENT",
                    "No feasible assignment satisfies all hard class and teacher constraints",
                )
            )
        return SolveJobResult(
            schemaVersion=CONTRACT_VERSION,
            jobId=request.jobId,
            status="INFEASIBLE",
            assignments=[],
            objectiveValue=None,
            diagnostics={
                "warnings": pre_solve.warnings,
                "conflicts": pre_solve_conflicts,
                "catalogVersion": CONFLICT_CATALOG_VERSION,
                "conflictDetails": conflict_details,
                "modelMetrics": {
                    "variableCount": 0,
                    "candidatePairCount": 0,
                    "domainPrunedCount": 0,
                    "roomDomainCount": 0,
                },
                "preSolve": pre_solve,
            },
            metadata=_build_metadata(
                request,
                random_seed,
                request.options.timeLimitSeconds if request.options else DEFAULT_TIME_LIMIT_SECONDS,
                adapter_payload,
            ),
        )
    slot_ids = {slot.id for slot in request.timeSlots}
    slots_by_id = {slot.id: slot for slot in request.timeSlots}
    lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
    warnings: list[str] = []
    conflicts: list[str] = []
    conflict_details = []
    model = cp_model.CpModel()
    variables: dict[tuple[str, int, str, str | None], cp_model.IntVar] = {}
    candidate_pair_count = 0
    domain_pruned_count = 0
    room_domain_count = 0
    room_model_enabled = request.rooms is not None
    rooms_by_id = {room.id: room for room in request.rooms or []}
    availability_rules = _active_availability_rules(request)
    hard_unavailable = [rule for rule in availability_rules if rule.strength == "HARD_UNAVAILABLE"]
    preference_rules = [rule for rule in availability_rules if rule.strength != "HARD_UNAVAILABLE"]
    penalty_terms = []

    for lesson in request.lessons:
        if lesson.fixedSlotId and lesson.fixedSlotId not in slot_ids:
            conflicts.append(f"Lesson {lesson.id} references unknown fixed slot {lesson.fixedSlotId}")
            conflict_details.append(
                conflict_diagnostic("UNKNOWN_FIXED_SLOT", f"Lesson {lesson.id} references unknown fixed slot.", {"lessonId": lesson.id})
            )
            continue

        requested_allowed = set(lesson.allowedSlotIds or slot_ids)
        allowed = set(requested_allowed)
        if lesson.fixedSlotId:
            allowed = {lesson.fixedSlotId}
        unknown = sorted(allowed - slot_ids)
        if unknown:
            conflicts.append(f"Lesson {lesson.id} references unknown slots: {', '.join(unknown)}")
            conflict_details.append(
                conflict_diagnostic("UNKNOWN_ALLOWED_SLOT", f"Lesson {lesson.id} references unknown slots.", {"lessonId": lesson.id})
            )
            allowed -= set(unknown)

        if room_model_enabled:
            eligible_room_ids = [
                room_id
                for room_id, room in sorted(rooms_by_id.items())
                if (not lesson.allowedRoomIds or room_id in lesson.allowedRoomIds)
                and all(
                    capability in room.capabilities
                    for capability in (lesson.requiredRoomCapabilities or [])
                )
            ]
            room_domain_count += len(eligible_room_ids)
            domain_pruned_count += max(0, len(rooms_by_id) - len(eligible_room_ids)) * len(allowed) * lesson.requiredSessions
            if not eligible_room_ids:
                conflicts.append(f"Lesson {lesson.id} has no eligible rooms")
                conflict_details.append(
                    conflict_diagnostic(
                        "ROOM_CAPABILITY_UNSATISFIED",
                        f"Lesson {lesson.id} has no room matching its room constraints.",
                        {"lessonId": lesson.id},
                    )
                )
                continue
        else:
            # A missing rooms collection is the backwards-compatible no-room
            # mode. It keeps existing requests valid without creating room
            # collision constraints or inventing a room identifier.
            eligible_room_ids = [None]

        domain_pruned_count += len(unknown) * len(eligible_room_ids) * lesson.requiredSessions

        for session_index in range(lesson.requiredSessions):
            choices = []
            for slot_id in sorted(allowed):
                slot = slots_by_id[slot_id]
                if any(
                    rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot)
                    for rule in hard_unavailable
                ):
                    domain_pruned_count += len(eligible_room_ids)
                    continue
                for room_id in eligible_room_ids:
                    room_label = room_id or "no-room"
                    variable = model.NewBoolVar(f"{lesson.id}_{session_index}_{slot_id}_{room_label}")
                    variables[(lesson.id, session_index, slot_id, room_id)] = variable
                    candidate_pair_count += 1
                    choices.append(variable)
                    for rule in preference_rules:
                        if rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot):
                            penalty = _availability_penalty(rule)
                            if penalty:
                                penalty_terms.append(variable * penalty)
            if choices:
                model.AddExactlyOne(choices)
            else:
                conflicts.append(
                    f"Lesson {lesson.id} session {session_index} has no allowed slots after hard teacher availability rules"
                )
                conflict_details.append(
                    conflict_diagnostic(
                        "HARD_AVAILABILITY_CONFLICT",
                        f"Lesson {lesson.id} session {session_index} has no allowed slots after hard teacher availability rules",
                        {"lessonId": lesson.id},
                    )
                )

    if conflicts:
        return SolveJobResult(
            schemaVersion=CONTRACT_VERSION,
            jobId=request.jobId,
            status="INFEASIBLE",
            assignments=[],
            objectiveValue=None,
            diagnostics={
                "warnings": warnings,
                "conflicts": conflicts,
                "catalogVersion": CONFLICT_CATALOG_VERSION,
                "conflictDetails": conflict_details,
                "modelMetrics": {
                    "variableCount": len(variables),
                    "candidatePairCount": candidate_pair_count,
                    "domainPrunedCount": domain_pruned_count,
                    "roomDomainCount": room_domain_count,
                },
                "preSolve": pre_solve,
            },
            metadata=_build_metadata(
                request,
                random_seed,
                request.options.timeLimitSeconds if request.options else DEFAULT_TIME_LIMIT_SECONDS,
                adapter_payload,
            ),
        )

    for slot_id in slot_ids:
        for resource in ("classId", "teacherId"):
            for resource_id in {getattr(lesson, resource) for lesson in request.lessons}:
                choices = [
                    variable
                    for (lesson_id, _, candidate_slot_id, _), variable in variables.items()
                    if candidate_slot_id == slot_id and getattr(lessons_by_id[lesson_id], resource) == resource_id
                ]
                if choices:
                    model.AddAtMostOne(choices)

        if room_model_enabled:
            for room_id in rooms_by_id:
                choices = [
                    variable
                    for (_, _, candidate_slot_id, candidate_room_id), variable in variables.items()
                    if candidate_slot_id == slot_id and candidate_room_id == room_id
                ]
                if choices:
                    model.AddAtMostOne(choices)

    if penalty_terms:
        model.Minimize(sum(penalty_terms))

    solver = cp_model.CpSolver()
    # The seed is a harness-level control for reproducibility checks; it is not
    # part of the v1 API/Python request contract.
    solver.parameters.random_seed = random_seed
    time_limit_seconds = request.options.timeLimitSeconds if request.options else DEFAULT_TIME_LIMIT_SECONDS
    solver.parameters.max_time_in_seconds = time_limit_seconds
    status = solver.Solve(model)
    status_name = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
    }.get(status, "UNKNOWN")

    if status_name == "INFEASIBLE" and not conflicts:
        conflicts.append("No feasible assignment satisfies all hard class and teacher constraints")
        conflict_details.append(
            conflict_diagnostic("NO_FEASIBLE_ASSIGNMENT", "No feasible assignment satisfies all hard class and teacher constraints")
        )

    assignments: list[Assignment] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (lesson_id, session_index, slot_id, room_id), variable in variables.items():
            if solver.Value(variable):
                assignments.append(
                    Assignment(
                        lessonId=lesson_id,
                        sessionIndex=session_index,
                        slotId=slot_id,
                        roomId=room_id,
                    )
                )

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
        for assignment in assignments:
            lesson = lessons_by_id[assignment.lessonId]
            slot = slots_by_id[assignment.slotId]
            for rule in preference_rules:
                if rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot):
                    warnings.append(
                        f"PREFERENCE_VIOLATED:{rule.code}:teacher={lesson.teacherId}:slot={assignment.slotId}"
                    )
                    conflict_details.append(
                        conflict_diagnostic(
                            "PREFERENCE_VIOLATED",
                            f"Teacher {lesson.teacherId} preference {rule.code} was violated at slot {assignment.slotId}.",
                            {"teacherId": lesson.teacherId, "slotId": assignment.slotId},
                            "WARNING",
                        )
                    )

    return SolveJobResult(
        schemaVersion=CONTRACT_VERSION,
        jobId=request.jobId,
        status=status_name,
        assignments=assignments,
        objectiveValue=solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        diagnostics={
            "warnings": warnings,
            "conflicts": conflicts,
            "catalogVersion": CONFLICT_CATALOG_VERSION,
            "conflictDetails": conflict_details,
            "modelMetrics": {
                "variableCount": len(variables),
                "candidatePairCount": candidate_pair_count,
                "domainPrunedCount": domain_pruned_count,
                "roomDomainCount": room_domain_count,
            },
            "preSolve": pre_solve,
        },
        metadata=_build_metadata(request, random_seed, time_limit_seconds, adapter_payload),
    )
