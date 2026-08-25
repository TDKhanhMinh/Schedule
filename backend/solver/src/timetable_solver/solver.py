from ortools.sat.python import cp_model

from .contracts import (
    Assignment,
    CONTRACT_VERSION,
    DEFAULT_TIME_LIMIT_SECONDS,
    SOLVER_VERSION,
    SolveJobRequest,
    SolveJobResult,
)
from .teacher_availability import TeacherAvailabilityRule


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


def solve(request: SolveJobRequest, *, random_seed: int = 0) -> SolveJobResult:
    slot_ids = {slot.id for slot in request.timeSlots}
    lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
    warnings: list[str] = []
    conflicts: list[str] = []
    model = cp_model.CpModel()
    variables: dict[tuple[str, int, str], cp_model.IntVar] = {}
    availability_rules = _active_availability_rules(request)
    hard_unavailable = [rule for rule in availability_rules if rule.strength == "HARD_UNAVAILABLE"]
    preference_rules = [rule for rule in availability_rules if rule.strength != "HARD_UNAVAILABLE"]
    penalty_terms = []

    for lesson in request.lessons:
        if lesson.fixedSlotId and lesson.fixedSlotId not in slot_ids:
            conflicts.append(f"Lesson {lesson.id} references unknown fixed slot {lesson.fixedSlotId}")
            continue

        allowed = set(lesson.allowedSlotIds or slot_ids)
        if lesson.fixedSlotId:
            allowed = {lesson.fixedSlotId}
        unknown = sorted(allowed - slot_ids)
        if unknown:
            conflicts.append(f"Lesson {lesson.id} references unknown slots: {', '.join(unknown)}")
            allowed -= set(unknown)

        for session_index in range(lesson.requiredSessions):
            choices = []
            for slot_id in sorted(allowed):
                slot = next(slot for slot in request.timeSlots if slot.id == slot_id)
                if any(
                    rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot)
                    for rule in hard_unavailable
                ):
                    continue
                variable = model.NewBoolVar(f"{lesson.id}_{session_index}_{slot_id}")
                variables[(lesson.id, session_index, slot_id)] = variable
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

    if conflicts:
        return SolveJobResult(
            schemaVersion=CONTRACT_VERSION,
            jobId=request.jobId,
            status="INFEASIBLE",
            assignments=[],
            objectiveValue=None,
            diagnostics={"warnings": warnings, "conflicts": conflicts},
            metadata={
                "solverVersion": SOLVER_VERSION,
                "contractVersion": CONTRACT_VERSION,
                "randomSeed": random_seed,
                "timeLimitSeconds": request.options.timeLimitSeconds if request.options else DEFAULT_TIME_LIMIT_SECONDS,
                "ruleSnapshotId": request.ruleSnapshotId,
                "ruleSetVersion": request.ruleSetVersion,
                "ruleSnapshotHash": request.ruleSnapshotHash,
            },
        )

    for slot_id in slot_ids:
        for resource in ("classId", "teacherId"):
            for resource_id in {getattr(lesson, resource) for lesson in request.lessons}:
                choices = [
                    variable
                    for (lesson_id, _, candidate_slot_id), variable in variables.items()
                    if candidate_slot_id == slot_id and getattr(lessons_by_id[lesson_id], resource) == resource_id
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

    assignments: list[Assignment] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (lesson_id, session_index, slot_id), variable in variables.items():
            if solver.Value(variable):
                assignments.append(Assignment(lessonId=lesson_id, sessionIndex=session_index, slotId=slot_id))

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        slots_by_id = {slot.id: slot for slot in request.timeSlots}
        lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
        for assignment in assignments:
            lesson = lessons_by_id[assignment.lessonId]
            slot = slots_by_id[assignment.slotId]
            for rule in preference_rules:
                if rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot):
                    warnings.append(
                        f"PREFERENCE_VIOLATED:{rule.code}:teacher={lesson.teacherId}:slot={assignment.slotId}"
                    )

    return SolveJobResult(
        schemaVersion=CONTRACT_VERSION,
        jobId=request.jobId,
        status=status_name,
        assignments=assignments,
        objectiveValue=solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        diagnostics={"warnings": warnings, "conflicts": conflicts},
        metadata={
            "solverVersion": SOLVER_VERSION,
            "contractVersion": CONTRACT_VERSION,
            "randomSeed": random_seed,
            "timeLimitSeconds": time_limit_seconds,
            "ruleSnapshotId": request.ruleSnapshotId,
            "ruleSetVersion": request.ruleSetVersion,
            "ruleSnapshotHash": request.ruleSnapshotHash,
        },
    )
