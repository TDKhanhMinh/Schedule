from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT.parent / "Download" / "Du_lieu_giao_vien_lop_phan_cong_GVCN_THCS_2026_2027.xlsx"
INPUT_PATH = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else DEFAULT_INPUT
DRY_RUN = "--dry-run" in sys.argv
API_BASE_URL = os.getenv("NGUYEN_TRAI_API_BASE_URL", "http://localhost:3011/api/v1").rstrip("/")
TENANT_ID = os.getenv("NGUYEN_TRAI_TENANT_ID", "34ec13a2-7f70-4325-8439-408885feca58")
SCOPE_SCHOOL_ID = os.getenv("NGUYEN_TRAI_SCOPE_SCHOOL_ID", "00000000-0000-0000-0000-000000000001")
ACTOR_ID = os.getenv("NGUYEN_TRAI_ACTOR_ID", "import-thcs-nguyen-trai-workbook")
ACADEMIC_YEAR = "2026-2027"
PERIOD_CODE = "FULL_YEAR"


def text(value: object) -> str:
    return "" if value is None else str(value).strip()


def number(value: object) -> float | None:
    if value is None or text(value) == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def rows(workbook: openpyxl.Workbook, sheet_name: str) -> list[list[object]]:
    sheet = workbook[sheet_name]
    result: list[list[object]] = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        values = list(row[:12])
        if any(value is not None and text(value) for value in values):
            result.append(values)
    return result


def actual_subject_rows(subject_rows: list[list[object]]) -> list[list[object]]:
    summary_rows = {"Đối chiếu tổng tiết bắt buộc", "Tổng số tiết/năm", "TB tiết/tuần"}
    return [row for row in subject_rows if text(row[0]) not in summary_rows]


def request(method: str, endpoint: str, school_id: str, body: dict[str, object] | None = None) -> object:
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "x-user-id": ACTOR_ID,
        "x-user-role": "ADMIN",
        "x-school-id": school_id,
        "x-tenant-id": TENANT_ID,
    }
    if payload is not None:
        headers["content-type"] = "application/json"
    req = Request(f"{API_BASE_URL}{endpoint}", data=payload, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read()
    except (HTTPError, URLError) as error:
        detail = error.read().decode("utf-8", "replace") if isinstance(error, HTTPError) else str(error)
        raise RuntimeError(f"{method} {endpoint}: {detail}") from error
    if not raw:
        return None
    return json.loads(raw.decode("utf-8"))


def by_code(records: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    return {text(record.get("code")): record for record in records}


def ensure_school() -> tuple[dict[str, object], bool]:
    schools = request("GET", "/schools", SCOPE_SCHOOL_ID)
    existing = next(
        (
            school
            for school in schools
            if school.get("name") == "THCS Nguyễn Trãi" or school.get("code") == "THCS-NGUYEN-TRAI"
        ),
        None,
    )
    if existing:
        return existing, False
    return request("POST", "/schools", SCOPE_SCHOOL_ID, {"name": "THCS Nguyễn Trãi"}), True


def ensure_period(school_id: str) -> tuple[dict[str, object], bool]:
    periods = request("GET", f"/schools/{school_id}/academic-periods", school_id)
    existing = next(
        (period for period in periods if period.get("academicYear") == ACADEMIC_YEAR and period.get("termCode") == PERIOD_CODE),
        None,
    )
    if existing:
        return existing, False
    return (
        request(
            "POST",
            f"/schools/{school_id}/academic-periods",
            school_id,
            {
                "academicYear": ACADEMIC_YEAR,
                "termCode": PERIOD_CODE,
                "name": "Năm học 2026-2027",
                "startsOn": "2026-08-15",
                "endsOn": "2027-05-31",
            },
        ),
        True,
    )


def ensure_teachers(school_id: str, source_rows: list[list[object]]) -> tuple[list[dict[str, object]], int]:
    records = request("GET", f"/schools/{school_id}/teachers", school_id)
    lookup = by_code(records)
    created = 0
    for row in source_rows:
        code = text(row[0])
        if code in lookup:
            continue
        record = request("POST", f"/schools/{school_id}/teachers", school_id, {"code": code, "displayName": text(row[1])})
        lookup[code] = record
        created += 1
    return list(lookup.values()), created


def ensure_classes(school_id: str, source_rows: list[list[object]]) -> tuple[list[dict[str, object]], int]:
    records = request("GET", f"/schools/{school_id}/classes", school_id)
    lookup = by_code(records)
    created = 0
    for row in source_rows:
        code = text(row[0])
        if code in lookup:
            continue
        grade = number(row[1])
        record = request(
            "POST",
            f"/schools/{school_id}/classes",
            school_id,
            {"code": code, "name": text(row[2]), "grade": int(grade) if grade is not None else None},
        )
        lookup[code] = record
        created += 1
    return list(lookup.values()), created


def ensure_subjects(school_id: str, source_rows: list[list[object]]) -> tuple[list[dict[str, object]], int]:
    records = request("GET", f"/schools/{school_id}/subjects", school_id)
    lookup = {text(record.get("name")): record for record in records}
    created = 0
    for row in source_rows:
        name = text(row[1])
        if name in lookup:
            continue
        record = request("POST", f"/schools/{school_id}/subjects", school_id, {"name": name})
        lookup[name] = record
        created += 1
    return list(lookup.values()), created


def ensure_rooms(school_id: str, class_rows: list[list[object]]) -> tuple[list[dict[str, object]], int, int]:
    records = request("GET", f"/schools/{school_id}/rooms", school_id)
    lookup = by_code(records)
    room_capacity: dict[str, int] = {}
    for row in class_rows:
        room_code = text(row[4])
        class_size = number(row[3])
        if room_code and class_size is not None:
            room_capacity[room_code] = max(room_capacity.get(room_code, 0), int(class_size))
    created = 0
    for code, capacity in room_capacity.items():
        if code in lookup:
            continue
        record = request(
            "POST",
            f"/schools/{school_id}/rooms",
            school_id,
            {"code": code, "name": f"Phòng học {code}", "roomType": "CLASSROOM", "capacity": capacity},
        )
        lookup[code] = record
        created += 1
    return list(lookup.values()), created, len(room_capacity)


def ensure_time_slots(school_id: str, period_id: str) -> tuple[int, int]:
    endpoint = f"/schools/{school_id}/academic-periods/{period_id}/time-slots"
    records = request("GET", endpoint, school_id)
    existing = {f"{record.get('day')}:{record.get('period')}:{record.get('shiftCode')}" for record in records}
    ranges = {
        "MORNING": [("07:00", "07:50"), ("08:00", "08:50"), ("09:05", "09:55"), ("10:05", "10:55"), ("11:05", "11:55")],
        "AFTERNOON": [("13:30", "14:20"), ("14:30", "15:20"), ("15:35", "16:25"), ("16:35", "17:25"), ("17:35", "18:25")],
    }
    created = 0
    for day in range(1, 7):
        for shift, times in ranges.items():
            for period, (starts_at, ends_at) in enumerate(times, start=1):
                key = f"{day}:{period}:{shift}"
                if key in existing:
                    continue
                request(
                    "POST",
                    endpoint,
                    school_id,
                    {"day": day, "period": period, "shiftCode": shift, "startsAt": starts_at, "endsAt": ends_at},
                )
                existing.add(key)
                created += 1
    return len(existing), created


def configure_grade_shifts(school_id: str, period_id: str) -> None:
    request(
        "PUT",
        f"/schools/{school_id}/academic-periods/{period_id}/grade-shifts",
        school_id,
        {
            "configs": [
                {"grade": grade, "mainShiftCode": "MORNING", "secondaryShiftCode": "AFTERNOON", "allowSecondary": True}
                for grade in range(6, 10)
            ]
        },
    )


def ensure_lesson_requirements(
    school_id: str,
    period_id: str,
    source_rows: list[list[object]],
    class_rows: list[list[object]],
    classes: list[dict[str, object]],
    subjects: list[dict[str, object]],
    teachers: list[dict[str, object]],
    rooms: list[dict[str, object]],
) -> tuple[int, int]:
    endpoint = f"/schools/{school_id}/academic-periods/{period_id}/lesson-requirements"
    existing_records = request("GET", endpoint, school_id)
    existing = {f"{record.get('classId')}:{record.get('subjectId')}:{record.get('teacherId')}" for record in existing_records}
    class_lookup = by_code(classes)
    teacher_lookup = by_code(teachers)
    subject_lookup = {text(record.get("name")): record for record in subjects}
    room_lookup = by_code(rooms)
    class_source_lookup = {text(row[0]): row for row in class_rows}
    created = 0
    for row in source_rows:
        class_record = class_lookup.get(text(row[3]))
        teacher_record = teacher_lookup.get(text(row[1]))
        subject_record = subject_lookup.get(text(row[6]))
        class_source = class_source_lookup.get(text(row[3]))
        room_record = room_lookup.get(text(class_source[4])) if class_source else None
        if not class_record or not teacher_record or not subject_record:
            raise RuntimeError(f"Không ánh xạ được phân công {text(row[0])}.")
        key = f"{class_record['id']}:{subject_record['id']}:{teacher_record['id']}"
        if key in existing:
            continue
        weekly_sessions = number(row[9])
        request(
            "POST",
            endpoint,
            school_id,
            {
                "classId": class_record["id"],
                "subjectId": subject_record["id"],
                "teacherId": teacher_record["id"],
                "roomId": room_record["id"] if room_record else None,
                "requiredSessions": max(1, round(weekly_sessions or 1)),
            },
        )
        existing.add(key)
        created += 1
    return len(existing), created


def ensure_professional_assignments(
    school_id: str,
    period_id: str,
    source_rows: list[list[object]],
    subjects: list[dict[str, object]],
    teachers: list[dict[str, object]],
) -> tuple[int, int]:
    endpoint = f"/schools/{school_id}/academic-periods/{period_id}/teacher-subject-grade-assignments"
    existing_records = request("GET", endpoint, school_id)
    existing = {f"{record.get('teacherId')}:{record.get('subjectId')}:{record.get('grade')}" for record in existing_records}
    teacher_lookup = by_code(teachers)
    subject_lookup = {text(record.get("name")): record for record in subjects}
    unique: dict[str, dict[str, object]] = {}
    for row in source_rows:
        teacher_record = teacher_lookup.get(text(row[1]))
        subject_record = subject_lookup.get(text(row[6]))
        grade = number(row[4])
        if not teacher_record or not subject_record or grade is None:
            raise RuntimeError(f"Không ánh xạ được phân công chuyên môn {text(row[0])}.")
        body = {"teacherId": teacher_record["id"], "subjectId": subject_record["id"], "grade": int(grade)}
        unique[f"{body['teacherId']}:{body['subjectId']}:{body['grade']}"] = body
    created = 0
    for key, body in unique.items():
        if key in existing:
            continue
        request("POST", endpoint, school_id, body)
        existing.add(key)
        created += 1
    return len(existing), created


def ensure_homerooms(
    school_id: str,
    period_id: str,
    source_rows: list[list[object]],
    classes: list[dict[str, object]],
    teachers: list[dict[str, object]],
) -> tuple[int, int]:
    existing = request("GET", f"/schools/{school_id}/academic-periods/{period_id}/homeroom-assignments", school_id)
    class_lookup = by_code(classes)
    teacher_lookup = by_code(teachers)
    assigned = 0
    for row in source_rows:
        class_record = class_lookup.get(text(row[0]))
        teacher_record = teacher_lookup.get(text(row[2]))
        if not class_record or not teacher_record:
            raise RuntimeError(f"Không ánh xạ được GVCN lớp {text(row[0])}.")
        reduction = number(row[5])
        request(
            "PUT",
            f"/schools/{school_id}/academic-periods/{period_id}/classes/{class_record['id']}/homeroom",
            school_id,
            {
                "teacherId": teacher_record["id"],
                "weeklyReductionPeriods": int(reduction if reduction is not None else 4),
                "ruleCode": "TT_05_2025_D9_1",
            },
        )
        assigned += 1
    return max(len(existing), assigned), assigned


def main() -> None:
    if not INPUT_PATH.exists():
        raise RuntimeError(f"Không tìm thấy workbook: {INPUT_PATH}")
    file_checksum = hashlib.sha256(INPUT_PATH.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(INPUT_PATH, data_only=True)
    teacher_rows = rows(workbook, "Giáo viên")
    class_rows = rows(workbook, "Lớp")
    subject_rows = actual_subject_rows(rows(workbook, "Kế hoạch CTGDPT"))
    assignment_rows = rows(workbook, "Phân công")
    homeroom_rows = rows(workbook, "GVCN")
    report: dict[str, object] = {
        "inputPath": str(INPUT_PATH),
        "fileChecksum": file_checksum,
        "source": {
            "teachers": len(teacher_rows),
            "classes": len(class_rows),
            "subjects": len(subject_rows),
            "lessonRequirements": len(assignment_rows),
            "homerooms": len(homeroom_rows),
            "professionalAssignments": len({(text(row[1]), text(row[6]), int(number(row[4]) or 0)) for row in assignment_rows}),
        },
    }
    if DRY_RUN:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    school, school_created = ensure_school()
    school_id = str(school["id"])
    period, period_created = ensure_period(school_id)
    period_id = str(period["id"])
    teachers, teachers_created = ensure_teachers(school_id, teacher_rows)
    classes, classes_created = ensure_classes(school_id, class_rows)
    subjects, subjects_created = ensure_subjects(school_id, subject_rows)
    rooms, rooms_created, source_room_count = ensure_rooms(school_id, class_rows)
    slot_count, slots_created = ensure_time_slots(school_id, period_id)
    configure_grade_shifts(school_id, period_id)
    lesson_count, lessons_created = ensure_lesson_requirements(
        school_id, period_id, assignment_rows, class_rows, classes, subjects, teachers, rooms
    )
    professional_count, professional_created = ensure_professional_assignments(
        school_id, period_id, assignment_rows, subjects, teachers
    )
    homeroom_count, homerooms_assigned = ensure_homerooms(school_id, period_id, homeroom_rows, classes, teachers)
    report.update(
        {
            "school": {"id": school_id, "code": school.get("code"), "name": school.get("name"), "created": school_created},
            "period": {"id": period_id, "name": period.get("name"), "academicYear": period.get("academicYear"), "created": period_created},
            "imported": {
                "teachers": {"source": len(teacher_rows), "total": len(teachers), "created": teachers_created},
                "classes": {"source": len(class_rows), "total": len(classes), "created": classes_created},
                "subjects": {"source": len(subject_rows), "total": len(subjects), "created": subjects_created},
                "rooms": {"source": source_room_count, "total": len(rooms), "created": rooms_created},
                "timeSlots": {"total": slot_count, "created": slots_created},
                "lessonRequirements": {"source": len(assignment_rows), "total": lesson_count, "created": lessons_created},
                "professionalAssignments": {"source": report["source"]["professionalAssignments"], "total": professional_count, "created": professional_created},
                "homerooms": {"source": len(homeroom_rows), "total": homeroom_count, "assigned": homerooms_assigned},
            },
            "excludedFromDatabase": ["Tổng quan", "Tải giáo viên", "Nguồn quy định"],
            "note": "Mã môn được tự sinh từ tên môn; Phân công được nạp thành lesson requirements và quan hệ giáo viên-môn-khối. Điện thoại/email chưa có field trong schema hiện tại.",
        }
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
