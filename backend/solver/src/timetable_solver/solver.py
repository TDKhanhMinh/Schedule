import math
import time

from ortools.sat.python import cp_model

from .conflict_catalog import CONFLICT_CATALOG_VERSION, conflict_diagnostic
from .constraint_audit import audit_hard_constraints
from .contracts import (
    Assignment,
    CONTRACT_VERSION,
    DEFAULT_TIME_LIMIT_SECONDS,
    LockedAssignment,
    SOLVER_VERSION,
    SolveJobRequest,
    SolveJobResult,
)
from .teacher_availability import TeacherAvailabilityRule
from .pre_solve import run_pre_solve_checks
from .relaxation import build_relaxation_proposals
from .solver_adapter import SolverAdapterPayload


OBJECTIVE_GROUPS = (
    "teacherGap",
    "compactness",
    "dayDistribution",
    "undesirableSlots",
    "preferredDays",
    "fairness",
)
DEFAULT_OBJECTIVE_WEIGHTS = {
    "teacherGap": 0.0,
    "compactness": 0.0,
    "dayDistribution": 0.0,
    "undesirableSlots": 1.0,
    "preferredDays": 1.0,
    "fairness": 0.0,
}


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
    if request.objective:
        metadata["objectiveContractVersion"] = request.objective.contractVersion
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


def _objective_weights(request: SolveJobRequest) -> dict[str, float]:
    if request.objective is None:
        return DEFAULT_OBJECTIVE_WEIGHTS.copy()
    return request.objective.weights.model_dump()


def _objective_group_for_rule(rule: TeacherAvailabilityRule) -> str:
    code = rule.code.upper()
    return "preferredDays" if "DAY" in code or "PREFERRED" in code else "undesirableSlots"


def _empty_objective_breakdown() -> dict[str, int]:
    return {group: 0 for group in (*OBJECTIVE_GROUPS, "weightedTotal")}


def _assignment_key(lesson_id: str, session_index: int) -> str:
    return f"{lesson_id}:{session_index}"


def _local_repair_diagnostics(request: SolveJobRequest, assignments: list[Assignment], solved: bool):
    repair = request.localRepair
    if repair is None:
        return None
    baseline = {
        _assignment_key(item.lessonId, item.sessionIndex): (item.slotId, item.roomId)
        for item in repair.baselineAssignments
    }
    affected = set(repair.affectedAssignmentKeys)
    actual = {
        _assignment_key(item.lessonId, item.sessionIndex): (item.slotId, item.roomId)
        for item in assignments
    }
    moved = sum(1 for key in affected if actual.get(key) != baseline.get(key)) if solved else 0
    preserved = sum(1 for key in affected if actual.get(key) == baseline.get(key)) if solved else 0
    outside_unchanged = solved and all(
        actual.get(key) == value for key, value in baseline.items() if key not in affected
    )
    return {
        "contractVersion": repair.contractVersion,
        "baselineSnapshotHash": repair.baselineSnapshotHash,
        "affectedAssignmentKeys": sorted(affected),
        "frozenAssignmentKeys": sorted(repair.frozenAssignmentKeys),
        "movedAssignmentCount": moved,
        "preservedAssignmentCount": preserved,
        "outsideScopeUnchanged": outside_unchanged,
    }


def _build_run_metrics(
    started_at: float,
    solver: cp_model.CpSolver | None = None,
    objective_enabled: bool = False,
    status_name: str | None = None,
) -> dict[str, float | None]:
    best_bound: float | None = None
    objective_gap: float | None = None
    if solver is not None and objective_enabled and status_name in {"OPTIMAL", "FEASIBLE"}:
        best_bound = float(solver.BestObjectiveBound())
        objective_value = float(solver.ObjectiveValue())
        if math.isfinite(best_bound) and math.isfinite(objective_value):
            objective_gap = 0.0 if abs(objective_value) < 1e-9 else max(
                0.0,
                abs(objective_value - best_bound) / max(abs(objective_value), 1.0) * 100,
            )
    return {
        "wallTimeMs": round((time.perf_counter() - started_at) * 1000, 3),
        "bestObjectiveBound": best_bound,
        "objectiveGapPercent": objective_gap,
    }


def solve(
    request: SolveJobRequest,
    *,
    random_seed: int = 0,
    adapter_payload: SolverAdapterPayload | None = None,
) -> SolveJobResult:
    started_at = time.perf_counter()
    pre_solve = run_pre_solve_checks(request)
    local_repair_details = _local_repair_diagnostics(request, [], False)
    relaxation_proposals = build_relaxation_proposals(request, [issue.code for issue in pre_solve.issues])
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
                "hardConstraintViolations": [],
                "objectiveBreakdown": _empty_objective_breakdown(),
                "runMetrics": _build_run_metrics(started_at),
                "localRepair": local_repair_details,
                "relaxationProposals": relaxation_proposals,
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
    repair = request.localRepair
    baseline_by_occurrence = {
        (item.lessonId, item.sessionIndex): item for item in (repair.baselineAssignments if repair else [])
    }
    affected_repair_keys = set(repair.affectedAssignmentKeys) if repair else set()
    frozen_repair_keys = set(repair.frozenAssignmentKeys) if repair else set()
    locked_by_occurrence = {
        (item.lessonId, item.sessionIndex): item for item in (request.lockedAssignments.assignments if request.lockedAssignments else [])
    }
    if repair:
        expected_keys = {
            (lesson.id, session_index)
            for lesson in request.lessons
            for session_index in range(lesson.requiredSessions)
        }
        missing_keys = sorted(expected_keys - set(baseline_by_occurrence))
        extra_keys = sorted(set(baseline_by_occurrence) - expected_keys)
        if missing_keys:
            conflicts.append(
                "LOCAL_REPAIR_BASELINE_INCOMPLETE:missing="
                + ",".join(_assignment_key(*key) for key in missing_keys)
            )
        if extra_keys:
            conflicts.append(
                "LOCAL_REPAIR_BASELINE_UNKNOWN:extra="
                + ",".join(_assignment_key(*key) for key in extra_keys)
            )
        for key, baseline in baseline_by_occurrence.items():
            key_text = _assignment_key(*key)
            if key_text not in affected_repair_keys or key_text in frozen_repair_keys:
                existing = locked_by_occurrence.get(key)
                if existing and (existing.slotId != baseline.slotId or existing.roomId != baseline.roomId):
                    conflicts.append(f"LOCAL_REPAIR_LOCK_CONFLICT:{key_text}")
                else:
                    locked_by_occurrence[key] = LockedAssignment(
                        lessonId=baseline.lessonId,
                        sessionIndex=baseline.sessionIndex,
                        slotId=baseline.slotId,
                        roomId=baseline.roomId,
                        scope="LESSON",
                        scopeId=baseline.lessonId,
                    )
    availability_rules = _active_availability_rules(request)
    hard_unavailable = [rule for rule in availability_rules if rule.strength == "HARD_UNAVAILABLE"]
    preference_rules = [rule for rule in availability_rules if rule.strength != "HARD_UNAVAILABLE"]
    objective_weights = _objective_weights(request)
    objective_scales = {group: round(objective_weights[group] * 1000) for group in OBJECTIVE_GROUPS}
    objective_terms: list[object] = []
    repair_move_terms: list[cp_model.IntVar] = []
    objective_score_terms: dict[str, list[tuple[cp_model.IntVar, int]]] = {
        group: [] for group in OBJECTIVE_GROUPS
    }

    def register_objective_term(group: str, variable: cp_model.IntVar, coefficient: int) -> None:
        if coefficient <= 0:
            return
        objective_score_terms[group].append((variable, coefficient))
        if objective_scales[group] > 0:
            objective_terms.append(variable * coefficient * objective_scales[group])

    def add_pair_indicator(left: cp_model.IntVar, right: cp_model.IntVar, name: str) -> cp_model.IntVar:
        indicator = model.NewBoolVar(name)
        model.Add(indicator <= left)
        model.Add(indicator <= right)
        model.Add(indicator >= left + right - 1)
        return indicator

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
        class_blocked = set((request.classUnavailableSlotIds or {}).get(lesson.classId, []))

        for session_index in range(lesson.requiredSessions):
            locked_assignment = locked_by_occurrence.get((lesson.id, session_index))
            session_allowed = set(allowed)
            if locked_assignment:
                if locked_assignment.slotId not in slot_ids:
                    conflicts.append(
                        f"Locked assignment for lesson {lesson.id} references unknown slot {locked_assignment.slotId}"
                    )
                    conflict_details.append(
                        conflict_diagnostic(
                            "UNKNOWN_LOCKED_SLOT",
                            f"Locked assignment for lesson {lesson.id} references unknown slot.",
                            {"lessonId": lesson.id, "slotId": locked_assignment.slotId},
                        )
                    )
                    continue
                session_allowed &= {locked_assignment.slotId}
                if locked_assignment.roomId and not room_model_enabled:
                    conflicts.append(f"Locked assignment for lesson {lesson.id} requires a room model")
                    conflict_details.append(
                        conflict_diagnostic(
                            "LOCKED_ROOM_MODEL_REQUIRED",
                            f"Locked assignment for lesson {lesson.id} requires room constraints in the solve input.",
                            {"lessonId": lesson.id, "roomId": locked_assignment.roomId},
                        )
                    )
                    continue
            choices = []
            class_blocked_slots = 0
            teacher_blocked_slots = 0
            room_blocked_slots = 0
            for slot_id in sorted(session_allowed):
                slot = slots_by_id[slot_id]
                if slot_id in class_blocked:
                    class_blocked_slots += 1
                    domain_pruned_count += len(eligible_room_ids)
                    continue
                if any(
                    rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot)
                    for rule in hard_unavailable
                ):
                    teacher_blocked_slots += 1
                    domain_pruned_count += len(eligible_room_ids)
                    continue
                available_room_ids = [
                    room_id
                    for room_id in eligible_room_ids
                    if room_id is None or slot_id not in (rooms_by_id[room_id].unavailableSlotIds or [])
                ]
                if locked_assignment and locked_assignment.roomId:
                    available_room_ids = [room_id for room_id in available_room_ids if room_id == locked_assignment.roomId]
                if not available_room_ids:
                    room_blocked_slots += 1
                    domain_pruned_count += len(eligible_room_ids)
                    continue
                domain_pruned_count += len(eligible_room_ids) - len(available_room_ids)
                for room_id in available_room_ids:
                    room_label = room_id or "no-room"
                    variable = model.NewBoolVar(f"{lesson.id}_{session_index}_{slot_id}_{room_label}")
                    variables[(lesson.id, session_index, slot_id, room_id)] = variable
                    candidate_pair_count += 1
                    choices.append(variable)
                    for rule in preference_rules:
                        if rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot):
                            penalty = _availability_penalty(rule)
                            if penalty:
                                register_objective_term(
                                    _objective_group_for_rule(rule),
                                    variable,
                                    penalty,
                                )
            if choices:
                model.AddExactlyOne(choices)
                repair_key = _assignment_key(lesson.id, session_index)
                if repair and repair_key in affected_repair_keys and repair_key not in frozen_repair_keys:
                    baseline = baseline_by_occurrence[(lesson.id, session_index)]
                    moved = model.NewBoolVar(f"local_repair_moved_{lesson.id}_{session_index}")
                    baseline_variable = variables.get((lesson.id, session_index, baseline.slotId, baseline.roomId))
                    if baseline_variable is None:
                        model.Add(moved == 1)
                    else:
                        model.Add(moved + baseline_variable == 1)
                    repair_move_terms.append(moved)
            else:
                if class_blocked_slots == len(session_allowed) and session_allowed:
                    code = "CLASS_AVAILABILITY_CONFLICT"
                    message = f"Lesson {lesson.id} session {session_index} has no slots after class unavailability rules"
                elif room_blocked_slots == len(session_allowed) and session_allowed and room_model_enabled:
                    code = "ROOM_AVAILABILITY_CONFLICT"
                    message = f"Lesson {lesson.id} session {session_index} has no rooms available in its allowed slots"
                else:
                    code = "HARD_AVAILABILITY_CONFLICT"
                    message = f"Lesson {lesson.id} session {session_index} has no allowed slots after hard availability rules"
                conflicts.append(message)
                conflict_details.append(
                    conflict_diagnostic(
                        code,
                        message,
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
                "hardConstraintViolations": [],
                "objectiveBreakdown": _empty_objective_breakdown(),
                "runMetrics": _build_run_metrics(started_at),
                "localRepair": _local_repair_diagnostics(request, [], False),
                "relaxationProposals": build_relaxation_proposals(
                    request,
                    [issue.code for issue in pre_solve.issues] + [detail.code for detail in conflict_details],
                ),
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

    if objective_weights["teacherGap"] > 0 or objective_weights["compactness"] > 0:
        pair_groups: dict[tuple[str, int], list[tuple[int, cp_model.IntVar]]] = {}
        for (lesson_id, _, slot_id, _), variable in variables.items():
            lesson = lessons_by_id[lesson_id]
            slot = slots_by_id[slot_id]
            for resource, group, enabled in (
                ("teacherId", "teacherGap", objective_weights["teacherGap"] > 0),
                ("classId", "compactness", objective_weights["compactness"] > 0),
            ):
                if enabled:
                    pair_groups.setdefault((f"{resource}:{getattr(lesson, resource)}", slot.day), []).append(
                        (slot.period, variable)
                    )
        for (resource_key, day), candidates in pair_groups.items():
            for left_index, (left_period, left_variable) in enumerate(candidates):
                for right_index in range(left_index + 1, len(candidates)):
                    right_period, right_variable = candidates[right_index]
                    distance_cost = max(0, abs(right_period - left_period) - 1)
                    if distance_cost:
                        group = "teacherGap" if resource_key.startswith("teacherId:") else "compactness"
                        indicator = add_pair_indicator(
                            left_variable,
                            right_variable,
                            f"objective_{group}_{day}_{left_index}_{right_index}",
                        )
                        register_objective_term(group, indicator, distance_cost)

    def add_balance_terms(resource: str, group: str) -> None:
        if objective_weights[group] <= 0:
            return
        resource_ids = {getattr(lesson, resource) for lesson in request.lessons}
        days = sorted({slot.day for slot in request.timeSlots})
        for resource_id in resource_ids:
            demand = sum(
                lesson.requiredSessions
                for lesson in request.lessons
                if getattr(lesson, resource) == resource_id
            )
            if not demand or not days:
                continue
            for day in days:
                day_variables = [
                    variable
                    for (lesson_id, _, slot_id, _), variable in variables.items()
                    if getattr(lessons_by_id[lesson_id], resource) == resource_id
                    and slots_by_id[slot_id].day == day
                ]
                load = model.NewIntVar(0, demand, f"objective_{group}_{resource_id}_{day}_load")
                model.Add(load == sum(day_variables) if day_variables else 0)
                deviation = model.NewIntVar(
                    0,
                    demand * len(days),
                    f"objective_{group}_{resource_id}_{day}_deviation",
                )
                model.AddAbsEquality(deviation, load * len(days) - demand)
                register_objective_term(group, deviation, 1)

    add_balance_terms("classId", "dayDistribution")
    add_balance_terms("teacherId", "fairness")

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

    if objective_terms or repair_move_terms:
        # Repair preservation is lexicographically more important than ordinary
        # soft preferences; hard constraints remain authoritative.
        model.Minimize(sum(repair_move_terms) * 1_000_000 + sum(objective_terms))

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

    hard_constraint_violations = (
        audit_hard_constraints(request, assignments)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        else []
    )
    if hard_constraint_violations:
        status_name = "INFEASIBLE"
        assignments = []
        conflicts.extend(hard_constraint_violations)
        conflict_details.append(
            conflict_diagnostic(
                "NO_FEASIBLE_ASSIGNMENT",
                "Decoded solver output violated one or more hard constraints.",
            )
        )

    objective_breakdown = _empty_objective_breakdown()
    if status_name in {"OPTIMAL", "FEASIBLE"}:
        for group in OBJECTIVE_GROUPS:
            objective_breakdown[group] = sum(
                solver.Value(variable) * coefficient
                for variable, coefficient in objective_score_terms[group]
            )
            objective_breakdown["weightedTotal"] += objective_breakdown[group] * objective_scales[group]

    run_metrics = _build_run_metrics(
        started_at,
        solver,
        bool(objective_terms or repair_move_terms),
        status_name,
    )

    if status_name in {"OPTIMAL", "FEASIBLE"}:
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

    local_repair_details = _local_repair_diagnostics(request, assignments, status_name in {"OPTIMAL", "FEASIBLE"})
    relaxation_proposals = build_relaxation_proposals(
        request,
        [issue.code for issue in pre_solve.issues] + [item.split(":", 1)[0] for item in conflicts],
    )
    return SolveJobResult(
        schemaVersion=CONTRACT_VERSION,
        jobId=request.jobId,
        status=status_name,
        assignments=assignments,
        objectiveValue=solver.ObjectiveValue() if status_name in {"OPTIMAL", "FEASIBLE"} else None,
        diagnostics={
            "warnings": warnings,
            "conflicts": conflicts,
            "catalogVersion": CONFLICT_CATALOG_VERSION,
            "conflictDetails": conflict_details,
            "hardConstraintViolations": hard_constraint_violations,
            "objectiveBreakdown": objective_breakdown,
            "runMetrics": run_metrics,
            "localRepair": local_repair_details,
            "relaxationProposals": relaxation_proposals,
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
