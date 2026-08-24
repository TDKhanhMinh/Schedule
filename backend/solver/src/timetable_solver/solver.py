from ortools.sat.python import cp_model

from .contracts import Assignment, SolveJobRequest, SolveJobResult


def solve(request: SolveJobRequest) -> SolveJobResult:
    slot_ids = {slot.id for slot in request.timeSlots}
    lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
    warnings: list[str] = []
    conflicts: list[str] = []
    model = cp_model.CpModel()
    variables: dict[tuple[str, int, str], cp_model.IntVar] = {}

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
                variable = model.NewBoolVar(f"{lesson.id}_{session_index}_{slot_id}")
                variables[(lesson.id, session_index, slot_id)] = variable
                choices.append(variable)
            if choices:
                model.AddExactlyOne(choices)
            else:
                conflicts.append(f"Lesson {lesson.id} session {session_index} has no allowed slots")

    if conflicts:
        return SolveJobResult(
            schemaVersion="1.0",
            jobId=request.jobId,
            status="INFEASIBLE",
            assignments=[],
            objectiveValue=None,
            diagnostics={"warnings": warnings, "conflicts": conflicts},
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

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.options.timeLimitSeconds if request.options else 10.0
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

    return SolveJobResult(
        schemaVersion="1.0",
        jobId=request.jobId,
        status=status_name,
        assignments=assignments,
        objectiveValue=solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        diagnostics={"warnings": warnings, "conflicts": conflicts},
    )
