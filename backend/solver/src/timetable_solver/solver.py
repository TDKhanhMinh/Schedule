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
from .pre_solve_contract import PreSolveIssue
from .relaxation import build_relaxation_proposals
from .rule_catalog import find_rule_catalog_entry, is_rule_code_supported
from .solver_adapter import SolverAdapterPayload


OBJECTIVE_GROUPS = (
    "teacherGap",
    "compactness",
    "dayDistribution",
    "undesirableSlots",
    "preferredDays",
    "fairness",
)
SECONDARY_SHIFT_PENALTY = 1_000_000
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


def _rule_scope_matches(rule, resource: str, resource_id: str) -> bool:
    scope = rule.scope
    resource_type = scope.resourceType
    if resource_type and resource_type != resource:
        return False
    if resource == "TEACHER" and scope.actorType == "TEACHER" and scope.actorId:
        return scope.actorId == resource_id
    if scope.resourceIds:
        return resource_id in scope.resourceIds
    return resource_type == resource or (resource == "TEACHER" and scope.actorType == "TEACHER")


def _valid_day_list(value: object) -> bool:
    if not isinstance(value, list) or not 1 <= len(value) <= 2:
        return False
    if any(not isinstance(day, int) or day < 1 or day > 7 for day in value):
        return False
    return len(value) == len(set(value))


def _rule_definition_issues(request: SolveJobRequest):
    issues = []
    for rule in request.ruleDefinitions or []:
        entry = find_rule_catalog_entry(rule.code)
        if entry is None:
            issues.append(
                {
                    "code": "UNKNOWN_RULE_CODE",
                    "severity": "ERROR",
                    "entity": "RULE",
                    "message": f"Mã quy tắc chưa được đăng ký: {rule.code}.",
                    "details": {"ruleCode": rule.code},
                }
            )
            continue
        if not is_rule_code_supported(rule.code):
            issues.append(
                {
                    "code": "RULE_NOT_SUPPORTED",
                    "severity": "ERROR",
                    "entity": "RULE",
                    "message": f"Rule {rule.code} chưa có compiler được hỗ trợ.",
                    "details": {"ruleCode": rule.code},
                }
            )
            continue
        if rule.kind not in entry.supportedKinds:
            issues.append(
                {
                    "code": "RULE_KIND_NOT_SUPPORTED",
                    "severity": "ERROR",
                    "entity": "RULE",
                    "message": f"Rule {rule.code} không hỗ trợ kind {rule.kind}.",
                    "details": {"ruleCode": rule.code},
                }
            )
        if rule.approvalState != "APPROVED":
            issues.append(
                {
                    "code": "RULE_NOT_APPROVED",
                    "severity": "ERROR",
                    "entity": "RULE",
                    "message": f"Rule {rule.code} chưa được phê duyệt.",
                    "details": {"ruleCode": rule.code},
                }
            )
        if rule.code == "RULE-TEACHER-PREFERRED-OFF-DAYS":
            days = rule.parameters.get("daysOfWeek")
            if (
                not _valid_day_list(days)
            ):
                issues.append(
                    {
                        "code": "INVALID_RULE_PARAMETER",
                        "severity": "ERROR",
                        "entity": "RULE",
                        "message": "daysOfWeek phải chứa từ 1 đến 2 thứ khác nhau trong khoảng 1 đến 7.",
                        "details": {"ruleCode": rule.code},
                    }
                )
        elif rule.code == "RULE-TEACHER-MAX-WORKING-DAYS":
            max_days = rule.parameters.get("maxDays")
            if not isinstance(max_days, int) or max_days < 1 or max_days > 7:
                issues.append(
                    {
                        "code": "INVALID_RULE_PARAMETER",
                        "severity": "ERROR",
                        "entity": "RULE",
                        "message": "maxDays phải là số nguyên từ 1 đến 7.",
                        "details": {"ruleCode": rule.code},
                    }
                )
        elif rule.code == "RULE-SCHEDULE-NO-INTERNAL-GAPS":
            if rule.parameters.get("granularity") != "DAY_SHIFT":
                issues.append(
                    {
                        "code": "INVALID_RULE_PARAMETER",
                        "severity": "ERROR",
                        "entity": "RULE",
                        "message": "granularity của rule không để trống tiết phải là DAY_SHIFT.",
                        "details": {"ruleCode": rule.code},
                    }
                )
    return issues


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
    for issue in _rule_definition_issues(request):
        pre_solve.issues.append(PreSolveIssue.model_validate(issue))
    if any(issue.severity == "ERROR" for issue in pre_solve.issues):
        pre_solve.canSolve = False
    local_repair_details = _local_repair_diagnostics(request, [], False)
    relaxation_proposals = build_relaxation_proposals(request, [issue.code for issue in pre_solve.issues])
    if not pre_solve.canSolve:
        pre_solve_conflicts = [f"{issue.code}: {issue.message}" for issue in pre_solve.issues]
        conflict_details = [
            conflict_diagnostic(issue.code, issue.message, issue.entityReferences, issue.severity)
            for issue in pre_solve.issues
        ]
        if "Không có phân công khả thi nào thỏa mãn mọi ràng buộc cứng về lớp và giáo viên" not in pre_solve_conflicts:
            pre_solve_conflicts.append("Không có phân công khả thi nào thỏa mãn mọi ràng buộc cứng về lớp và giáo viên")
            conflict_details.append(
                conflict_diagnostic(
                    "NO_FEASIBLE_ASSIGNMENT",
                    "Không có phân công khả thi nào thỏa mãn mọi ràng buộc cứng về lớp và giáo viên",
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
    variables_by_resource_slot: dict[tuple[str, str, str], list[cp_model.IntVar]] = {}
    variables_by_room_slot: dict[tuple[str, str], list[cp_model.IntVar]] = {}
    occupancy_candidates: dict[tuple[str, str, int, str, int], list[cp_model.IntVar]] = {}
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
    rule_definitions = request.ruleDefinitions or []
    preferred_off_day_rules = [
        rule for rule in rule_definitions if rule.code == "RULE-TEACHER-PREFERRED-OFF-DAYS"
    ]
    max_working_day_rules = [
        rule for rule in rule_definitions if rule.code == "RULE-TEACHER-MAX-WORKING-DAYS"
    ]
    no_internal_gap_rules = [
        rule for rule in rule_definitions if rule.code == "RULE-SCHEDULE-NO-INTERNAL-GAPS"
    ]
    requires_occupancy = bool(no_internal_gap_rules or max_working_day_rules)
    objective_weights = _objective_weights(request)
    objective_scales = {group: round(objective_weights[group] * 1000) for group in OBJECTIVE_GROUPS}
    objective_terms: list[object] = []
    repair_move_terms: list[cp_model.IntVar] = []
    objective_score_terms: dict[str, list[tuple[cp_model.IntVar, int]]] = {
        group: [] for group in OBJECTIVE_GROUPS
    }
    choice_groups: list[list[cp_model.IntVar]] = []
    rule_objective_score_terms: dict[str, list[tuple[cp_model.IntVar, int]]] = {
        group: [] for group in OBJECTIVE_GROUPS
    }

    def register_objective_term(group: str, variable: cp_model.IntVar, coefficient: int) -> None:
        if coefficient <= 0:
            return
        objective_score_terms[group].append((variable, coefficient))
        if objective_scales[group] > 0:
            objective_terms.append(variable * coefficient * objective_scales[group])

    def register_rule_objective_term(group: str, variable: cp_model.IntVar, coefficient: int) -> None:
        if coefficient <= 0:
            return
        rule_objective_score_terms[group].append((variable, coefficient))
        objective_terms.append(variable * coefficient)

    def add_pair_indicator(left: cp_model.IntVar, right: cp_model.IntVar, name: str) -> cp_model.IntVar:
        indicator = model.NewBoolVar(name)
        model.Add(indicator <= left)
        model.Add(indicator <= right)
        model.Add(indicator >= left + right - 1)
        return indicator

    for lesson in request.lessons:
        if lesson.fixedSlotId and lesson.fixedSlotId not in slot_ids:
            conflicts.append(f"Yêu cầu tiết học {lesson.id} tham chiếu khung tiết cố định không tồn tại {lesson.fixedSlotId}")
            conflict_details.append(
                conflict_diagnostic("UNKNOWN_FIXED_SLOT", f"Yêu cầu tiết học {lesson.id} tham chiếu khung tiết cố định không tồn tại.", {"lessonId": lesson.id})
            )
            continue

        requested_allowed = set(lesson.allowedSlotIds or slot_ids)
        allowed = set(requested_allowed)
        if lesson.fixedSlotId:
            allowed = {lesson.fixedSlotId}
        unknown = sorted(allowed - slot_ids)
        if unknown:
            conflicts.append(f"Yêu cầu tiết học {lesson.id} tham chiếu các khung tiết không tồn tại: {', '.join(unknown)}")
            conflict_details.append(
                conflict_diagnostic("UNKNOWN_ALLOWED_SLOT", f"Yêu cầu tiết học {lesson.id} tham chiếu các khung tiết không tồn tại.", {"lessonId": lesson.id})
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
                conflicts.append(f"Yêu cầu tiết học {lesson.id} không có phòng phù hợp")
                conflict_details.append(
                    conflict_diagnostic(
                        "ROOM_CAPABILITY_UNSATISFIED",
                        f"Yêu cầu tiết học {lesson.id} không có phòng đáp ứng ràng buộc phòng.",
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
        shift_policy = (request.classShiftPolicies or {}).get(lesson.classId)
        allowed_shift_codes = None
        if shift_policy:
            allowed_shift_codes = {shift_policy.mainShiftCode}
            if shift_policy.allowSecondary:
                allowed_shift_codes.add(shift_policy.secondaryShiftCode)

        for session_index in range(lesson.requiredSessions):
            locked_assignment = locked_by_occurrence.get((lesson.id, session_index))
            session_allowed = set(allowed)
            if locked_assignment:
                if locked_assignment.slotId not in slot_ids:
                    conflicts.append(
                        f"Phân công đã khóa của yêu cầu tiết học {lesson.id} tham chiếu khung tiết không tồn tại {locked_assignment.slotId}"
                    )
                    conflict_details.append(
                        conflict_diagnostic(
                            "UNKNOWN_LOCKED_SLOT",
                            f"Phân công đã khóa của yêu cầu tiết học {lesson.id} tham chiếu khung tiết không tồn tại.",
                            {"lessonId": lesson.id, "slotId": locked_assignment.slotId},
                        )
                    )
                    continue
                session_allowed &= {locked_assignment.slotId}
                if locked_assignment.roomId and not room_model_enabled:
                    conflicts.append(f"Phân công đã khóa của yêu cầu tiết học {lesson.id} yêu cầu mô hình phòng")
                    conflict_details.append(
                        conflict_diagnostic(
                            "LOCKED_ROOM_MODEL_REQUIRED",
                            f"Phân công đã khóa của yêu cầu tiết học {lesson.id} yêu cầu ràng buộc phòng trong dữ liệu đầu vào tối ưu.",
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
                slot_shift_code = slot.shiftCode or "MORNING"
                if allowed_shift_codes is not None and slot_shift_code not in allowed_shift_codes:
                    domain_pruned_count += len(eligible_room_ids)
                    continue
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
                    for resource, lesson_attribute in (("CLASS", "classId"), ("TEACHER", "teacherId")):
                        resource_key = (lesson_attribute, getattr(lesson, lesson_attribute), slot_id)
                        variables_by_resource_slot.setdefault(resource_key, []).append(variable)
                        occupancy_key = (
                            resource,
                            getattr(lesson, lesson_attribute),
                            slot.day,
                            slot_shift_code,
                            slot.period,
                        )
                        occupancy_candidates.setdefault(occupancy_key, []).append(variable)
                    if room_id is not None:
                        variables_by_room_slot.setdefault((slot_id, room_id), []).append(variable)
                    candidate_pair_count += 1
                    choices.append(variable)
                    if shift_policy and slot_shift_code == shift_policy.secondaryShiftCode:
                        objective_terms.append(variable * SECONDARY_SHIFT_PENALTY)
                    for rule in preference_rules:
                        if rule.teacherId == lesson.teacherId and _rule_matches_slot(rule, slot):
                            penalty = _availability_penalty(rule)
                            if penalty:
                                register_objective_term(
                                    _objective_group_for_rule(rule),
                                    variable,
                                    penalty,
                                )
                    for rule in preferred_off_day_rules:
                        if not _rule_scope_matches(rule, "TEACHER", lesson.teacherId):
                            continue
                        requested_days = rule.parameters.get("daysOfWeek", [])
                        if slot.day in requested_days:
                            register_rule_objective_term(
                                "preferredDays",
                                variable,
                                max(1, round((rule.weight or 0) * 1000)),
                            )
            if choices:
                model.AddExactlyOne(choices)
                choice_groups.append(choices)
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
                    message = f"Yêu cầu tiết học {lesson.id}, buổi {session_index}, không còn khung tiết sau khi áp dụng quy tắc lớp không khả dụng"
                elif room_blocked_slots == len(session_allowed) and session_allowed and room_model_enabled:
                    code = "ROOM_AVAILABILITY_CONFLICT"
                    message = f"Yêu cầu tiết học {lesson.id}, buổi {session_index}, không còn phòng trong các khung tiết được phép"
                else:
                    code = "HARD_AVAILABILITY_CONFLICT"
                    message = f"Yêu cầu tiết học {lesson.id}, buổi {session_index}, không còn khung tiết được phép sau khi áp dụng quy tắc sẵn sàng cứng"
                conflicts.append(message)
                conflict_details.append(
                    conflict_diagnostic(
                        code,
                        message,
                        {"lessonId": lesson.id},
                    )
                )

    resource_ids = {
        "CLASS": sorted({lesson.classId for lesson in request.lessons}),
        "TEACHER": sorted({lesson.teacherId for lesson in request.lessons}),
    }
    shifts = sorted({slot.shiftCode or "MORNING" for slot in request.timeSlots})
    periods = sorted({slot.period for slot in request.timeSlots})
    days = sorted({slot.day for slot in request.timeSlots})
    occupied: dict[tuple[str, str, int, str, int], cp_model.IntVar] = {}
    for resource, ids in (resource_ids.items() if requires_occupancy else []):
        for resource_id in ids:
            for day in days:
                for shift in shifts:
                    for period in periods:
                        key = (resource, resource_id, day, shift, period)
                        indicator = model.NewBoolVar(
                            f"occupied_{resource}_{resource_id}_{day}_{shift}_{period}"
                        )
                        choices = occupancy_candidates.get(key, [])
                        if choices:
                            model.AddMaxEquality(indicator, choices)
                        else:
                            model.Add(indicator == 0)
                        occupied[key] = indicator

    for rule in (no_internal_gap_rules if requires_occupancy else []):
        for resource, ids in resource_ids.items():
            for resource_id in ids:
                if not _rule_scope_matches(rule, resource, resource_id):
                    continue
                for day in days:
                    for shift in shifts:
                        for left_index, left_period in enumerate(periods):
                            for right_period in periods[left_index + 2 :]:
                                left = occupied[(resource, resource_id, day, shift, left_period)]
                                right = occupied[(resource, resource_id, day, shift, right_period)]
                                between = periods[periods.index(left_period) + 1 : periods.index(right_period)]
                                pair = add_pair_indicator(
                                    left,
                                    right,
                                    f"no_gap_pair_{resource}_{resource_id}_{day}_{shift}_{left_period}_{right_period}",
                                )
                                for middle_period in between:
                                    middle = occupied[(resource, resource_id, day, shift, middle_period)]
                                    if rule.kind == "HARD":
                                        model.Add(middle >= pair)
                                    else:
                                        violation = model.NewBoolVar(
                                            f"no_gap_violation_{resource}_{resource_id}_{day}_{shift}_{left_period}_{middle_period}_{right_period}"
                                        )
                                        model.Add(violation <= pair)
                                        model.Add(violation <= 1 - middle)
                                        model.Add(violation >= pair - middle)
                                        register_rule_objective_term(
                                            "compactness",
                                            violation,
                                            max(1, round((rule.weight or 0) * 1000)),
                                        )

    for rule in (max_working_day_rules if requires_occupancy else []):
        max_days = rule.parameters.get("maxDays")
        if not isinstance(max_days, int):
            continue
        for teacher_id in resource_ids["TEACHER"]:
            if not _rule_scope_matches(rule, "TEACHER", teacher_id):
                continue
            teacher_days = []
            for day in days:
                day_indicator = model.NewBoolVar(f"teacher_day_{teacher_id}_{day}")
                shift_indicators = [
                    occupied[("TEACHER", teacher_id, day, shift, period)]
                    for shift in shifts
                    for period in periods
                ]
                if shift_indicators:
                    model.AddMaxEquality(day_indicator, shift_indicators)
                else:
                    model.Add(day_indicator == 0)
                teacher_days.append(day_indicator)
            model.Add(sum(teacher_days) <= max_days)

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
                choices = variables_by_resource_slot.get((resource, resource_id, slot_id), [])
                if choices:
                    model.AddAtMostOne(choices)

        if room_model_enabled:
            for room_id in rooms_by_id:
                choices = variables_by_room_slot.get((slot_id, room_id), [])
                if choices:
                    model.AddAtMostOne(choices)

    if objective_terms or repair_move_terms:
        # Repair preservation is lexicographically more important than ordinary
        # soft preferences; hard constraints remain authoritative.
        model.Minimize(sum(repair_move_terms) * 1_000_000 + sum(objective_terms))

    solver = cp_model.CpSolver()
    if not objective_terms and not repair_move_terms and variables:
        model.AddDecisionStrategy(
            list(variables.values()),
            cp_model.CHOOSE_FIRST,
            cp_model.SELECT_MAX_VALUE,
        )
        for choices in choice_groups:
            model.AddHint(choices[0], 1)
        solver.parameters.search_branching = cp_model.FIXED_SEARCH
    # The seed is a harness-level control for reproducibility checks; it is not
    # part of the v1 API/Python request contract.
    solver.parameters.random_seed = random_seed
    time_limit_seconds = request.options.timeLimitSeconds if request.options else DEFAULT_TIME_LIMIT_SECONDS
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_search_workers = 1 if not objective_terms and not repair_move_terms else 2
    status = solver.Solve(model)
    status_name = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
    }.get(status, "UNKNOWN")

    if status_name == "INFEASIBLE" and not conflicts:
        conflicts.append("Không có phân công khả thi nào thỏa mãn mọi ràng buộc cứng về lớp và giáo viên")
        conflict_details.append(
            conflict_diagnostic("NO_FEASIBLE_ASSIGNMENT", "Không có phân công khả thi nào thỏa mãn mọi ràng buộc cứng về lớp và giáo viên")
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
                "Kết quả bộ tối ưu giải mã đã vi phạm một hoặc nhiều ràng buộc cứng.",
            )
        )

    objective_breakdown = _empty_objective_breakdown()
    if status_name in {"OPTIMAL", "FEASIBLE"}:
        for group in OBJECTIVE_GROUPS:
            base_score = sum(
                solver.Value(variable) * coefficient
                for variable, coefficient in objective_score_terms[group]
            )
            rule_score = sum(
                solver.Value(variable) * coefficient
                for variable, coefficient in rule_objective_score_terms[group]
            )
            objective_breakdown[group] = base_score + rule_score
            objective_breakdown["weightedTotal"] += base_score * objective_scales[group] + rule_score

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
                            f"Ưu tiên {rule.code} của giáo viên {lesson.teacherId} bị vi phạm tại khung tiết {assignment.slotId}.",
                            {"teacherId": lesson.teacherId, "slotId": assignment.slotId},
                            "WARNING",
                        )
                    )
            for rule in preferred_off_day_rules:
                if not _rule_scope_matches(rule, "TEACHER", lesson.teacherId):
                    continue
                requested_days = rule.parameters.get("daysOfWeek", [])
                if slot.day in requested_days:
                    warnings.append(
                        f"PREFERENCE_VIOLATED:{rule.code}:teacher={lesson.teacherId}:slot={assignment.slotId}"
                    )
                    conflict_details.append(
                        conflict_diagnostic(
                            "PREFERENCE_VIOLATED",
                            f"Ưu tiên {rule.code} của giáo viên {lesson.teacherId} bị vi phạm tại khung tiết {assignment.slotId}.",
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
