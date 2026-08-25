from __future__ import annotations

from collections import defaultdict

from .contracts import SolveJobRequest
from .pre_solve_contract import PRE_SOLVE_CONTRACT_VERSION, PreSolveIssue, PreSolveReport
from .teacher_availability import TeacherAvailabilityRule


def _active_hard_teacher_rules(request: SolveJobRequest) -> list[TeacherAvailabilityRule]:
    availability = request.teacherAvailability
    if availability is None:
        return []
    return [
        rule
        for rule in availability.rules
        if rule.strength == "HARD_UNAVAILABLE"
        and rule.effectiveFrom <= availability.effectiveAsOf
        and (rule.effectiveTo is None or availability.effectiveAsOf <= rule.effectiveTo)
    ]


def _matches_slot(rule: TeacherAvailabilityRule, slot) -> bool:
    if slot.id in rule.blockedSlotIds:
        return True
    if rule.dayOfWeek != slot.day:
        return False
    if rule.shiftCode and rule.shiftCode != slot.shiftCode:
        return False
    if rule.period and rule.period != slot.period:
        return False
    return True


def _candidate_slots(request: SolveJobRequest, lesson, slots_by_id, hard_rules):
    issues: list[PreSolveIssue] = []
    allowed = set(lesson.allowedSlotIds or slots_by_id.keys())
    unknown = sorted(allowed - slots_by_id.keys())
    if unknown:
        issues.append(
            PreSolveIssue(
                code="UNKNOWN_ALLOWED_SLOT",
                severity="ERROR",
                lessonId=lesson.id,
                message=f"Lesson {lesson.id} references unknown allowed slots.",
                details={"slotIds": unknown},
            )
        )
        allowed -= set(unknown)
    if lesson.fixedSlotId:
        if lesson.fixedSlotId not in slots_by_id:
            issues.append(
                PreSolveIssue(
                    code="UNKNOWN_FIXED_SLOT",
                    severity="ERROR",
                    lessonId=lesson.id,
                    message=f"Lesson {lesson.id} references an unknown fixed slot.",
                    details={"slotId": lesson.fixedSlotId},
                )
            )
            allowed.clear()
        else:
            allowed = {lesson.fixedSlotId}
    class_blocked = set((request.classUnavailableSlotIds or {}).get(lesson.classId, []))
    teacher_rules = [rule for rule in hard_rules if rule.teacherId == lesson.teacherId]
    candidates = [
        slot_id
        for slot_id in allowed
        if slot_id not in class_blocked
        and not any(_matches_slot(rule, slots_by_id[slot_id]) for rule in teacher_rules)
    ]
    return candidates, issues


def _add_resource_capacity_issues(issues, lessons, candidates, resource: str, code: str):
    grouped = defaultdict(list)
    for lesson in lessons:
        grouped[getattr(lesson, resource)].append(lesson)
    for resource_id, resource_lessons in grouped.items():
        demand = sum(lesson.requiredSessions for lesson in resource_lessons)
        capacity = len({slot_id for lesson in resource_lessons for slot_id in candidates.get(lesson.id, [])})
        if demand > capacity:
            issues.append(
                PreSolveIssue(
                    code=code,
                    severity="ERROR",
                    resourceId=resource_id,
                    message=f"{resource} {resource_id} needs {demand} sessions but has {capacity} candidate slots.",
                    details={"demandSessions": demand, "availableSlots": capacity},
                )
            )


def run_pre_solve_checks(request: SolveJobRequest) -> PreSolveReport:
    issues: list[PreSolveIssue] = []
    slots_by_id = {slot.id: slot for slot in request.timeSlots}
    demand = sum(lesson.requiredSessions for lesson in request.lessons)
    hard_rules = _active_hard_teacher_rules(request)
    candidates = {}
    for lesson in request.lessons:
        lesson_candidates, lesson_issues = _candidate_slots(request, lesson, slots_by_id, hard_rules)
        candidates[lesson.id] = lesson_candidates
        issues.extend(lesson_issues)
        if lesson.requiredSessions > len(lesson_candidates):
            issues.append(
                PreSolveIssue(
                    code="LESSON_SLOT_CAPACITY_EXCEEDED",
                    severity="ERROR",
                    lessonId=lesson.id,
                    message=f"Lesson {lesson.id} needs {lesson.requiredSessions} sessions but has {len(lesson_candidates)} candidate slots.",
                    details={"requiredSessions": lesson.requiredSessions, "availableSlots": len(lesson_candidates)},
                )
            )

        if lesson.requiredRoomCapabilities:
            rooms = request.rooms or []
            eligible = [
                room
                for room in rooms
                if (not lesson.allowedRoomIds or room.id in lesson.allowedRoomIds)
                and all(capability in room.capabilities for capability in lesson.requiredRoomCapabilities)
            ]
            if not eligible:
                issues.append(
                    PreSolveIssue(
                        code="ROOM_CAPABILITY_UNSATISFIED",
                        severity="ERROR",
                        lessonId=lesson.id,
                        message=f"Lesson {lesson.id} has no room matching required capabilities.",
                        details={
                            "requiredRoomCapabilities": lesson.requiredRoomCapabilities,
                            "allowedRoomIds": lesson.allowedRoomIds or [],
                        },
                    )
                )

    class_slot_capacity = defaultdict(set)
    for lesson in request.lessons:
        class_slot_capacity[lesson.classId].update(candidates.get(lesson.id, []))
    slot_capacity = sum(len(slots) for slots in class_slot_capacity.values())
    if demand > slot_capacity:
        issues.append(
            PreSolveIssue(
                code="TOTAL_SLOT_CAPACITY_EXCEEDED",
                severity="ERROR",
                message=f"Total demand {demand} exceeds class-slot capacity {slot_capacity}.",
                details={"totalDemandSessions": demand, "slotCapacity": slot_capacity},
            )
        )

    _add_resource_capacity_issues(issues, request.lessons, candidates, "classId", "CLASS_SLOT_CAPACITY_EXCEEDED")
    _add_resource_capacity_issues(issues, request.lessons, candidates, "teacherId", "TEACHER_SLOT_CAPACITY_EXCEEDED")

    fixed_resources = {}
    for lesson in request.lessons:
        if not lesson.fixedSlotId:
            continue
        for resource in ("classId", "teacherId"):
            key = (resource, getattr(lesson, resource), lesson.fixedSlotId)
            previous = fixed_resources.get(key)
            if previous and previous != lesson.id:
                issues.append(
                    PreSolveIssue(
                        code="FIXED_RESOURCE_CONFLICT",
                        severity="ERROR",
                        lessonId=lesson.id,
                        resourceId=getattr(lesson, resource),
                        message=f"{resource} {getattr(lesson, resource)} has a fixed-slot conflict.",
                        details={"previousLessonId": previous, "slotId": lesson.fixedSlotId},
                    )
                )
            else:
                fixed_resources[key] = lesson.id

    return PreSolveReport(
        contractVersion=PRE_SOLVE_CONTRACT_VERSION,
        canSolve=not any(issue.severity == "ERROR" for issue in issues),
        totalDemandSessions=demand,
        slotCapacity=slot_capacity,
        issues=issues,
        warnings=[],
    )
