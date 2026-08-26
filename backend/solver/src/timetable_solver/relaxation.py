from collections import defaultdict

from .contracts import SolveJobRequest

RELAXATION_CONTRACT_VERSION = "RELAXATION-PROPOSAL-1.0.0"


def _rule_source(rule) -> dict[str, str]:
    return {
        "sourceUrl": rule.source.sourceUrl,
        "ruleSnapshotId": rule.source.ruleSnapshotId,
        "ruleSetVersion": rule.source.ruleSetVersion,
        "ruleSnapshotHash": rule.source.ruleSnapshotHash,
        **({"sourceLocator": rule.source.sourceLocator} if rule.source.sourceLocator else {}),
    }


def _proposal(
    *,
    kind: str,
    code: str,
    entity_id: str,
    score: int,
    affected_lessons: int,
    affected_entities: list[str],
    source: dict[str, str],
    impact: str,
    hard_rule_protected: bool,
):
    proposal_id = f"relax:{kind}:{code}:{entity_id}"
    return {
        "proposalId": proposal_id,
        "kind": kind,
        "targetCode": code,
        "priorityScore": score,
        "affectedLessonCount": affected_lessons,
        "affectedEntityIds": sorted(set(affected_entities)),
        "ruleSource": source,
        "impact": impact,
        "requiresApproval": True,
        "autoApply": False,
        "hardRuleProtected": hard_rule_protected,
    }


def build_relaxation_proposals(request: SolveJobRequest, issue_codes: list[str]):
    proposals = []
    affected_codes = set(issue_codes)
    lessons_by_teacher: defaultdict[str, list] = defaultdict(list)
    lessons_by_class: defaultdict[str, list] = defaultdict(list)
    for lesson in request.lessons:
        lessons_by_teacher[lesson.teacherId].append(lesson)
        lessons_by_class[lesson.classId].append(lesson)

    availability = request.teacherAvailability
    if availability:
        for rule in availability.rules:
            lessons = lessons_by_teacher.get(rule.teacherId, [])
            affected_sessions = sum(lesson.requiredSessions for lesson in lessons)
            if rule.strength != "HARD_UNAVAILABLE":
                if not lessons:
                    continue
                weight_score = round((rule.weight or 0) * 100)
                proposals.append(
                    _proposal(
                        kind="SOFT_RULE_WEIGHT",
                        code=rule.code,
                        entity_id=rule.teacherId,
                        score=affected_sessions * 1000 + weight_score,
                        affected_lessons=len(lessons),
                        affected_entities=[rule.teacherId, *[lesson.id for lesson in lessons]],
                        source=_rule_source(rule),
                        impact=f"Có thể tăng số slot khả dụng cho {affected_sessions} session của giáo viên {rule.teacherId}; không thay đổi rule tự động.",
                        hard_rule_protected=False,
                    )
                )
            elif "HARD_AVAILABILITY_CONFLICT" in affected_codes:
                proposals.append(
                    _proposal(
                        kind="STAKEHOLDER_HARD_RULE_REVIEW",
                        code=rule.code,
                        entity_id=rule.teacherId,
                        score=affected_sessions * 1000,
                        affected_lessons=len(lessons),
                        affected_entities=[rule.teacherId, *[lesson.id for lesson in lessons]],
                        source=_rule_source(rule),
                        impact=f"Rule hard unavailable đang ảnh hưởng {affected_sessions} session; chỉ stakeholder có thẩm quyền mới được sửa hoặc thay dữ liệu.",
                        hard_rule_protected=True,
                    )
                )

    for code in sorted(affected_codes):
        if code not in {"CLASS_SLOT_CAPACITY_EXCEEDED", "TEACHER_SLOT_CAPACITY_EXCEEDED", "TOTAL_SLOT_CAPACITY_EXCEEDED"}:
            continue
        if code == "TEACHER_SLOT_CAPACITY_EXCEEDED":
            grouped = lessons_by_teacher
            entity_label = "giáo viên"
        elif code == "CLASS_SLOT_CAPACITY_EXCEEDED":
            grouped = lessons_by_class
            entity_label = "lớp"
        else:
            grouped = {request.schoolId: request.lessons}
            entity_label = "trường"
        for entity_id, lessons in sorted(grouped.items()):
            if not lessons:
                continue
            affected_sessions = sum(lesson.requiredSessions for lesson in lessons)
            proposals.append(
                _proposal(
                    kind="STAKEHOLDER_DATA_CHANGE",
                    code=code,
                    entity_id=entity_id,
                    score=affected_sessions * 1000,
                    affected_lessons=len(lessons),
                    affected_entities=[entity_id, *[lesson.id for lesson in lessons]],
                    source={},
                    impact=f"Cần stakeholder xem xét mở rộng slot hoặc điều chỉnh dữ liệu cho {entity_label} {entity_id}; không tự nới hard constraint.",
                    hard_rule_protected=True,
                )
            )

    proposals.sort(key=lambda item: (-item["priorityScore"], item["proposalId"]))
    for rank, proposal in enumerate(proposals, start=1):
        proposal["rank"] = rank
    return proposals
