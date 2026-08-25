from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONFLICT_CATALOG_VERSION = "CONFLICT-CATALOG-1.0.0"
ConflictSeverity = Literal["ERROR", "WARNING", "INFO"]
ConflictEntity = Literal["IMPORT", "JOB", "LESSON", "CLASS", "TEACHER", "ROOM", "SLOT", "RULE"]


class ConflictDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    severity: ConflictSeverity
    entity: ConflictEntity
    messageTemplateVi: str
    remediationHintVi: str


class ConflictDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalogVersion: Literal["CONFLICT-CATALOG-1.0.0"]
    code: str = Field(min_length=1)
    severity: ConflictSeverity
    entity: ConflictEntity
    message: str = Field(min_length=1)
    remediationHint: str = Field(min_length=1)
    entityReferences: dict[str, str] = Field(default_factory=dict)


_CATALOG = [
    ("UNKNOWN_ALLOWED_SLOT", "ERROR", "SLOT", "Lesson tham chiếu slot không tồn tại.", "Chọn slot thuộc đúng academic period và cập nhật danh sách allowed slots."),
    ("UNKNOWN_FIXED_SLOT", "ERROR", "SLOT", "Lesson tham chiếu fixed slot không tồn tại.", "Bỏ fixed slot không hợp lệ hoặc chọn một slot đang tồn tại."),
    ("LESSON_SLOT_CAPACITY_EXCEEDED", "ERROR", "LESSON", "Lesson cần nhiều session hơn số slot khả dụng.", "Mở rộng allowed slots hoặc giảm số tiết của lesson theo scope đã duyệt."),
    ("TOTAL_SLOT_CAPACITY_EXCEEDED", "ERROR", "CLASS", "Tổng nhu cầu vượt sức chứa class-slot.", "Kiểm tra số tiết, số slot và phân bổ lesson theo từng lớp."),
    ("CLASS_SLOT_CAPACITY_EXCEEDED", "ERROR", "CLASS", "Lớp cần nhiều session hơn số slot khả dụng.", "Mở rộng slot của lớp hoặc điều chỉnh số tiết trong input."),
    ("TEACHER_SLOT_CAPACITY_EXCEEDED", "ERROR", "TEACHER", "Giáo viên cần nhiều session hơn số slot khả dụng.", "Mở rộng lịch khả dụng hoặc điều chỉnh phân công giáo viên."),
    ("FIXED_RESOURCE_CONFLICT", "ERROR", "JOB", "Hai lesson dùng cùng tài nguyên tại một fixed slot.", "Đổi fixed slot hoặc bỏ cố định một trong các lesson bị trùng."),
    ("ROOM_CAPABILITY_UNSATISFIED", "ERROR", "ROOM", "Không có phòng đáp ứng capability yêu cầu.", "Khai báo phòng có đủ capability hoặc điều chỉnh yêu cầu phòng."),
    ("ROOM_AVAILABILITY_CONFLICT", "ERROR", "ROOM", "Không còn phòng khả dụng cho lesson tại các slot được phép.", "Mở rộng lịch phòng hoặc chọn slot/phòng khác cho lesson."),
    ("CLASS_AVAILABILITY_CONFLICT", "ERROR", "CLASS", "Lớp bị chặn tại các slot mà lesson đang yêu cầu.", "Mở rộng lịch lớp hoặc điều chỉnh fixed/allowed slot của lesson."),
    ("HARD_AVAILABILITY_CONFLICT", "ERROR", "TEACHER", "Không còn slot sau khi áp dụng ràng buộc availability cứng.", "Mở rộng slot hoặc điều chỉnh rule availability đã approve."),
    ("NO_FEASIBLE_ASSIGNMENT", "ERROR", "JOB", "Không tìm được assignment thỏa mãn các hard constraints.", "Xem các conflict theo lesson/lớp/giáo viên và nới input hoặc rule phù hợp."),
    ("PREFERENCE_VIOLATED", "WARNING", "TEACHER", "Solver phải vi phạm một preference mềm.", "Review lịch kết quả hoặc giảm mức ưu tiên của preference nếu cần."),
]

CONFLICT_CATALOG = {
    code: ConflictDefinition(
        code=code,
        severity=severity,
        entity=entity,
        messageTemplateVi=message,
        remediationHintVi=hint,
    )
    for code, severity, entity, message, hint in _CATALOG
}


def conflict_diagnostic(
    code: str,
    message: str,
    entity_references: dict[str, str] | None = None,
    severity: ConflictSeverity | None = None,
) -> ConflictDiagnostic:
    definition = CONFLICT_CATALOG.get(code)
    return ConflictDiagnostic(
        catalogVersion=CONFLICT_CATALOG_VERSION,
        code=code,
        severity=severity or (definition.severity if definition else "ERROR"),
        entity=definition.entity if definition else "JOB",
        message=message,
        remediationHint=definition.remediationHintVi if definition else "Kiểm tra lại dữ liệu và rule liên quan rồi thử lại.",
        entityReferences=entity_references or {},
    )
