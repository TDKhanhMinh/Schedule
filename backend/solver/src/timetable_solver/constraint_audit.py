from collections import Counter, defaultdict

from .contracts import Assignment, SolveJobRequest


def audit_hard_constraints(
    request: SolveJobRequest,
    assignments: list[Assignment],
) -> list[str]:
    """Verify decoded output against the hard result contract.

    CP-SAT owns the constraints during optimization. This independent audit is
    a post-solve safety gate for reverse mapping and prevents malformed output
    from being reported as feasible after a future model or decoder change.
    """

    violations: list[str] = []
    lessons_by_id = {lesson.id: lesson for lesson in request.lessons}
    slot_ids = {slot.id for slot in request.timeSlots}
    expected = Counter(
        (lesson.id, session_index)
        for lesson in request.lessons
        for session_index in range(lesson.requiredSessions)
    )
    actual = Counter((assignment.lessonId, assignment.sessionIndex) for assignment in assignments)

    for occurrence, expected_count in expected.items():
        actual_count = actual[occurrence]
        if actual_count != expected_count:
            violations.append(
                f"EXACT_DEMAND_VIOLATION:{occurrence[0]}:session={occurrence[1]}:expected={expected_count}:actual={actual_count}"
            )

    for occurrence, actual_count in actual.items():
        if occurrence not in expected:
            violations.append(
                f"UNKNOWN_LESSON_OCCURRENCE:{occurrence[0]}:session={occurrence[1]}:actual={actual_count}"
            )

    class_slots: defaultdict[tuple[str, str], list[Assignment]] = defaultdict(list)
    teacher_slots: defaultdict[tuple[str, str], list[Assignment]] = defaultdict(list)
    room_slots: defaultdict[tuple[str, str], list[Assignment]] = defaultdict(list)
    room_ids = {room.id for room in request.rooms or []}

    for assignment in assignments:
        lesson = lessons_by_id.get(assignment.lessonId)
        if lesson is None:
            continue
        if assignment.slotId not in slot_ids:
            violations.append(f"UNKNOWN_SLOT_ASSIGNMENT:{assignment.lessonId}:slot={assignment.slotId}")
            continue

        class_slots[(lesson.classId, assignment.slotId)].append(assignment)
        teacher_slots[(lesson.teacherId, assignment.slotId)].append(assignment)

        if request.rooms is not None:
            if assignment.roomId is None:
                violations.append(f"MISSING_ROOM_ASSIGNMENT:{assignment.lessonId}:slot={assignment.slotId}")
            elif assignment.roomId not in room_ids:
                violations.append(
                    f"UNKNOWN_ROOM_ASSIGNMENT:{assignment.lessonId}:room={assignment.roomId}"
                )
            else:
                room_slots[(assignment.roomId, assignment.slotId)].append(assignment)

    for (class_id, slot_id), grouped in class_slots.items():
        if len(grouped) > 1:
            violations.append(f"CLASS_OVERLAP:{class_id}:slot={slot_id}")
    for (teacher_id, slot_id), grouped in teacher_slots.items():
        if len(grouped) > 1:
            violations.append(f"TEACHER_OVERLAP:{teacher_id}:slot={slot_id}")
    for (room_id, slot_id), grouped in room_slots.items():
        if len(grouped) > 1:
            violations.append(f"ROOM_OVERLAP:{room_id}:slot={slot_id}")

    return violations
