from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONFLICT_CATALOG_VERSION = "CONFLICT-CATALOG-1.0.0"
CONFLICT_CHAIN_CONTRACT_VERSION = "CONFLICT-CHAIN-1.0.0"
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
    conflictChain: "ConflictChain | None" = None


class ConflictChainNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodeId: str
    type: Literal["CONSTRAINT", "ENTITY", "OUTCOME"]
    label: str
    references: dict[str, str] = Field(default_factory=dict)


class ConflictChain(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["CONFLICT-CHAIN-1.0.0"]
    chainId: str
    rootCode: str
    nodes: list[ConflictChainNode]
    edges: list[dict[str, str]]


ConflictDiagnostic.model_rebuild()


_CATALOG = [
    ("UNKNOWN_ALLOWED_SLOT", "ERROR", "SLOT", "Yêu cầu tiết học tham chiếu khung tiết không tồn tại.", "Chọn khung tiết thuộc đúng khung năm học và cập nhật danh sách khung tiết cho phép."),
    ("UNKNOWN_FIXED_SLOT", "ERROR", "SLOT", "Yêu cầu tiết học tham chiếu khung tiết cố định không tồn tại.", "Bỏ khung tiết cố định không hợp lệ hoặc chọn một khung tiết đang tồn tại."),
    ("LESSON_SLOT_CAPACITY_EXCEEDED", "ERROR", "LESSON", "Yêu cầu tiết học cần nhiều buổi hơn số khung tiết khả dụng.", "Mở rộng các khung tiết cho phép hoặc giảm số tiết theo phạm vi đã duyệt."),
    ("TOTAL_SLOT_CAPACITY_EXCEEDED", "ERROR", "CLASS", "Tổng nhu cầu vượt sức chứa khung tiết theo lớp.", "Kiểm tra số tiết, số khung tiết và phân bổ yêu cầu tiết học theo từng lớp."),
    ("CLASS_SLOT_CAPACITY_EXCEEDED", "ERROR", "CLASS", "Lớp cần nhiều buổi hơn số khung tiết khả dụng.", "Mở rộng khung tiết của lớp hoặc điều chỉnh số tiết trong dữ liệu đầu vào."),
    ("TEACHER_SLOT_CAPACITY_EXCEEDED", "ERROR", "TEACHER", "Giáo viên cần nhiều buổi hơn số khung tiết khả dụng.", "Mở rộng lịch khả dụng hoặc điều chỉnh phân công giáo viên."),
    ("FIXED_RESOURCE_CONFLICT", "ERROR", "JOB", "Hai yêu cầu tiết học dùng cùng tài nguyên tại một khung tiết cố định.", "Đổi khung tiết cố định hoặc bỏ cố định một trong các yêu cầu tiết học bị trùng."),
    ("ROOM_CAPABILITY_UNSATISFIED", "ERROR", "ROOM", "Không có phòng đáp ứng capability yêu cầu.", "Khai báo phòng có đủ capability hoặc điều chỉnh yêu cầu phòng."),
    ("ROOM_AVAILABILITY_CONFLICT", "ERROR", "ROOM", "Không còn phòng khả dụng cho yêu cầu tiết học tại các khung tiết được phép.", "Mở rộng lịch phòng hoặc chọn khung tiết/phòng khác cho yêu cầu tiết học."),
    ("CLASS_AVAILABILITY_CONFLICT", "ERROR", "CLASS", "Lớp bị chặn tại các khung tiết mà yêu cầu tiết học đang cần.", "Mở rộng lịch lớp hoặc điều chỉnh khung tiết cố định/cho phép của yêu cầu tiết học."),
    ("HARD_AVAILABILITY_CONFLICT", "ERROR", "TEACHER", "Không còn khung tiết sau khi áp dụng ràng buộc sẵn sàng cứng.", "Mở rộng khung tiết hoặc điều chỉnh quy tắc sẵn sàng đã phê duyệt."),
    ("NO_FEASIBLE_ASSIGNMENT", "ERROR", "JOB", "Không tìm được phân công thỏa mãn các ràng buộc cứng.", "Xem các xung đột theo yêu cầu tiết học/lớp/giáo viên và nới dữ liệu đầu vào hoặc quy tắc phù hợp."),
    ("PREFERENCE_VIOLATED", "WARNING", "TEACHER", "Bộ tối ưu phải vi phạm một ưu tiên mềm.", "Rà soát lịch kết quả hoặc giảm mức ưu tiên nếu cần."),
    ("TEACHER_SUBJECT_GRADE_NOT_ALLOWED", "ERROR", "TEACHER", "Giáo viên chưa được phân công dạy môn và khối của yêu cầu tiết học.", "Bổ sung phân công chuyên môn cho giáo viên, môn và khối tương ứng hoặc đổi dữ liệu đầu vào."),
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
    resolved_severity = severity or (definition.severity if definition else "ERROR")
    references = entity_references or {}
    sorted_references = sorted(references.items())
    suffix = "|".join(f"{key}={value}" for key, value in sorted_references) or "root"
    chain_id = f"chain:{code}:{suffix}"
    root_id = f"{chain_id}:constraint"
    outcome_id = f"{chain_id}:outcome"
    entity_nodes = [
        ConflictChainNode(
            nodeId=f"{chain_id}:entity:{key}:{value}",
            type="ENTITY",
            label=f"{key}={value}",
            references={key: value},
        )
        for key, value in sorted_references
    ]
    chain = ConflictChain(
        contractVersion=CONFLICT_CHAIN_CONTRACT_VERSION,
        chainId=chain_id,
        rootCode=code,
        nodes=[
            ConflictChainNode(nodeId=root_id, type="CONSTRAINT", label=message, references={"code": code}),
            *entity_nodes,
            ConflictChainNode(
                nodeId=outcome_id,
                type="OUTCOME",
                label="Không thể tạo lịch hợp lệ." if resolved_severity == "ERROR" else "Cần review kết quả.",
                references={"outcome": "INFEASIBLE" if resolved_severity == "ERROR" else "REVIEW_REQUIRED"},
            ),
        ],
        edges=[
            *[
                {"from": node.nodeId, "to": root_id, "relation": "CAUSES"}
                for node in entity_nodes
            ],
            {"from": root_id, "to": outcome_id, "relation": "RESULTS_IN"},
        ],
    )
    return ConflictDiagnostic(
        catalogVersion=CONFLICT_CATALOG_VERSION,
        code=code,
        severity=resolved_severity,
        entity=definition.entity if definition else "JOB",
        message=message,
        remediationHint=definition.remediationHintVi if definition else "Kiểm tra lại dữ liệu và rule liên quan rồi thử lại.",
        entityReferences=references,
        conflictChain=chain,
    )
