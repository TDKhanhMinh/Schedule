"""CP-SAT assignment of eligible teachers to class-subject demands."""

import time

from ortools.sat.python import cp_model

from .contracts import SOLVER_VERSION
from .teacher_assignment_contracts import (
    ALGORITHM_VERSION,
    CONTRACT_VERSION,
    TeacherAssignmentProposal,
    TeacherAssignmentRequest,
    TeacherAssignmentResult,
)


UNASSIGNED_PENALTY = 1_000_000_000
LOAD_BALANCE_PENALTY = 100


def solve_teacher_assignments(request: TeacherAssignmentRequest) -> TeacherAssignmentResult:
    started_at = time.perf_counter()
    teachers_by_id = {teacher.id: teacher for teacher in request.teachers}
    eligibility_by_key: dict[tuple[str, int], list[str]] = {}
    for eligibility in request.eligibility:
        key = (eligibility.subjectId, eligibility.grade)
        if eligibility.teacherId in teachers_by_id:
            eligibility_by_key.setdefault(key, []).append(eligibility.teacherId)
    for key in eligibility_by_key:
        eligibility_by_key[key] = sorted(set(eligibility_by_key[key]))

    manual_by_demand: dict[str, object] = {}
    conflicts: list[str] = []
    for manual in request.manualAssignments:
        if manual.demandId in manual_by_demand:
            conflicts.append(f"DUPLICATE_MANUAL_ASSIGNMENT:{manual.demandId}")
        manual_by_demand[manual.demandId] = manual
        if manual.teacherId not in teachers_by_id:
            conflicts.append(f"MANUAL_TEACHER_NOT_ACTIVE:{manual.demandId}:{manual.teacherId}")

    demand_ids = {demand.id for demand in request.demands}
    unknown_manual = sorted(set(manual_by_demand) - demand_ids)
    conflicts.extend(f"MANUAL_DEMAND_NOT_FOUND:{demand_id}" for demand_id in unknown_manual)

    model = cp_model.CpModel()
    assignment_variables: dict[tuple[str, str], cp_model.IntVar] = {}
    unassigned_variables: dict[str, cp_model.IntVar] = {}
    candidates_by_demand: dict[str, list[str]] = {}
    manual_demand_ids: set[str] = set()
    no_candidate_reasons: dict[str, tuple[str, str]] = {}
    candidate_pair_count = 0

    for demand in sorted(request.demands, key=lambda item: item.id):
        manual = manual_by_demand.get(demand.id)
        if manual is not None and getattr(manual, "locked", True):
            manual_demand_ids.add(demand.id)
            if getattr(manual, "teacherId") not in teachers_by_id:
                no_candidate_reasons[demand.id] = (
                    "MANUAL_TEACHER_NOT_ACTIVE",
                    "Phân công thủ công đang trỏ đến giáo viên không còn hoạt động.",
                )
                continue
            candidates = [getattr(manual, "teacherId")]
        else:
            candidates = eligibility_by_key.get((demand.subjectId, demand.grade), [])
            if not candidates:
                no_candidate_reasons[demand.id] = (
                    "NO_ELIGIBLE_TEACHER",
                    "Không có giáo viên active được phân công đúng môn và khối.",
                )
                continue

        candidates_by_demand[demand.id] = candidates
        candidate_pair_count += len(candidates)
        variables = []
        for teacher_id in candidates:
            variable = model.NewBoolVar(f"assign_{demand.id}_{teacher_id}")
            assignment_variables[(demand.id, teacher_id)] = variable
            variables.append(variable)
        if demand.id in manual_demand_ids:
            model.Add(variables[0] == 1)
        else:
            unassigned = model.NewBoolVar(f"unassigned_{demand.id}")
            unassigned_variables[demand.id] = unassigned
            model.Add(sum(variables) + unassigned == 1)

    total_demand_sessions = sum(demand.requiredSessions for demand in request.demands)
    load_expressions: dict[str, object] = {}
    deviation_variables: list[cp_model.IntVar] = []
    for teacher in sorted(request.teachers, key=lambda item: item.id):
        base_sessions = int(round(teacher.assignedWeeklySessions))
        terms = [
            variable * demand.requiredSessions
            for demand in request.demands
            for teacher_id in [teacher.id]
            if (variable := assignment_variables.get((demand.id, teacher_id))) is not None
        ]
        load_expression = base_sessions + sum(terms)
        load_expressions[teacher.id] = load_expression
        maximum_load = base_sessions + total_demand_sessions + 1
        if teacher.hardWeeklyLimitSessions is not None:
            model.Add(load_expression <= int(teacher.hardWeeklyLimitSessions))
        deviation = model.NewIntVar(0, maximum_load + int(teacher.adjustedWeeklyTarget) + 1, f"load_deviation_{teacher.id}")
        model.AddAbsEquality(deviation, load_expression - int(round(teacher.adjustedWeeklyTarget)))
        deviation_variables.append(deviation)

    objective_terms = [deviation * LOAD_BALANCE_PENALTY for deviation in deviation_variables]
    objective_terms.extend(unassigned * UNASSIGNED_PENALTY for unassigned in unassigned_variables.values())
    if objective_terms:
        model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.random_seed = request.randomSeed
    solver.parameters.num_search_workers = 1
    if request.options.timeLimitSeconds is not None:
        solver.parameters.max_time_in_seconds = request.options.timeLimitSeconds
    status = solver.Solve(model)
    status_name = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
    }.get(status, "UNKNOWN")

    selected_teacher_by_demand: dict[str, str] = {}
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (demand_id, teacher_id), variable in assignment_variables.items():
            if solver.Value(variable):
                selected_teacher_by_demand[demand_id] = teacher_id

    if conflicts and status_name == "OPTIMAL":
        status_name = "INFEASIBLE"

    unassigned_ids = sorted(
        set(no_candidate_reasons)
        | {
            demand_id
            for demand_id, variable in unassigned_variables.items()
            if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) and solver.Value(variable)
        }
    )
    if status_name in {"OPTIMAL", "FEASIBLE"} and unassigned_ids:
        status_name = "PARTIAL"

    warnings = []
    if unassigned_ids:
        warnings.append(f"Có {len(unassigned_ids)} nhu cầu chưa được gán giáo viên.")
    if any(teacher.hardWeeklyLimitSessions is None for teacher in request.teachers):
        warnings.append("Giới hạn tải dạy chỉ được áp dụng cứng cho giáo viên có rule HARD_CAP.")

    load_before = {teacher.id: teacher.assignedWeeklySessions for teacher in request.teachers}
    load_after = dict(load_before)
    for demand in request.demands:
        teacher_id = selected_teacher_by_demand.get(demand.id)
        if teacher_id:
            load_after[teacher_id] += demand.requiredSessions
    teacher_targets = {teacher.id: teacher.adjustedWeeklyTarget for teacher in request.teachers}

    proposals: list[TeacherAssignmentProposal] = []
    for demand in sorted(request.demands, key=lambda item: item.id):
        manual = manual_by_demand.get(demand.id)
        selected_teacher_id = selected_teacher_by_demand.get(demand.id)
        if demand.id in no_candidate_reasons:
            reason_code, reason = no_candidate_reasons[demand.id]
            proposals.append(
                TeacherAssignmentProposal(
                    demandId=demand.id,
                    teacherId=getattr(manual, "teacherId", None) if manual is not None else None,
                    requiredSessions=demand.requiredSessions,
                    source="MANUAL" if manual is not None else "AUTO",
                    isLocked=bool(manual is not None and getattr(manual, "locked", True)),
                    status="UNASSIGNED",
                    score=None,
                    reasonCode=reason_code,
                    reason=reason,
                    loadBefore=None,
                    loadAfter=None,
                    adjustedTarget=None,
                )
            )
            continue
        if selected_teacher_id is None:
            reason_code = "NO_FEASIBLE_CAPACITY" if demand.id in unassigned_ids else "SOLVER_NO_ASSIGNMENT"
            reason = "Không thể gán giáo viên mà vẫn thỏa các giới hạn tải dạy hiện tại."
            proposals.append(
                TeacherAssignmentProposal(
                    demandId=demand.id,
                    teacherId=None,
                    requiredSessions=demand.requiredSessions,
                    source="AUTO",
                    isLocked=False,
                    status="UNASSIGNED",
                    score=None,
                    reasonCode=reason_code,
                    reason=reason,
                    loadBefore=None,
                    loadAfter=None,
                    adjustedTarget=None,
                )
            )
            continue
        proposals.append(
            TeacherAssignmentProposal(
                demandId=demand.id,
                teacherId=selected_teacher_id,
                requiredSessions=demand.requiredSessions,
                source="MANUAL" if demand.id in manual_demand_ids else "AUTO",
                isLocked=demand.id in manual_demand_ids,
                status="ACCEPTED" if demand.id in manual_demand_ids else "PROPOSED",
                score=float(abs(load_after[selected_teacher_id] - teacher_targets[selected_teacher_id])),
                reasonCode=None,
                reason=None,
                loadBefore=load_before[selected_teacher_id],
                loadAfter=load_after[selected_teacher_id],
                adjustedTarget=teacher_targets[selected_teacher_id],
            )
        )

    if status_name == "INFEASIBLE" and not conflicts:
        conflicts.append("Không có phương án phân công thỏa các ràng buộc cứng về giáo viên và tải dạy.")

    return TeacherAssignmentResult(
        contractVersion=CONTRACT_VERSION,
        jobId=request.jobId,
        status=status_name,
        proposals=proposals,
        diagnostics={
            "warnings": warnings,
            "conflicts": conflicts,
            "unassignedDemandIds": unassigned_ids,
            "modelMetrics": {
                "variableCount": len(assignment_variables),
                "candidatePairCount": candidate_pair_count,
                "unassignedVariableCount": len(unassigned_variables),
            },
            "runMetrics": {"wallTimeMs": round((time.perf_counter() - started_at) * 1000, 3)},
        },
        metadata={
            "solverVersion": SOLVER_VERSION,
            "contractVersion": CONTRACT_VERSION,
            "algorithmVersion": ALGORITHM_VERSION,
            "randomSeed": request.randomSeed,
            "timeLimitSeconds": request.options.timeLimitSeconds,
            "ruleSnapshotId": request.ruleSnapshotId,
            "ruleSetVersion": request.ruleSetVersion,
            "ruleSnapshotHash": request.ruleSnapshotHash,
        },
    )
