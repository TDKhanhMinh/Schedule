from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .conflict_catalog import CONFLICT_CATALOG_VERSION, ConflictDiagnostic
from .teacher_availability import TeacherAvailabilitySet
from .pre_solve_contract import PreSolveReport
from .rule_contract import RuleDefinition

CONTRACT_VERSION = "1.0"
SOLVER_VERSION = "0.1.0"
OBJECTIVE_CONTRACT_VERSION = "SOLVER-OBJECTIVE-1.0.0"
DEFAULT_TIME_LIMIT_SECONDS = 10.0
LOCKED_ASSIGNMENTS_CONTRACT_VERSION = "LOCKED-ASSIGNMENTS-1.0.0"
LOCAL_REPAIR_CONTRACT_VERSION = "LOCAL-REPAIR-1.0.0"
RELAXATION_CONTRACT_VERSION = "RELAXATION-PROPOSAL-1.0.0"


class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    day: int = Field(ge=1, le=7)
    period: int = Field(ge=1)
    shiftCode: str | None = Field(default=None, min_length=1)


class LessonRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    classId: str = Field(min_length=1)
    subjectId: str = Field(min_length=1)
    teacherId: str = Field(min_length=1)
    requiredSessions: int = Field(ge=1)
    allowedSlotIds: list[str] | None = None
    fixedSlotId: str | None = Field(default=None, min_length=1)
    allowedRoomIds: list[str] | None = None
    requiredRoomCapabilities: list[str] | None = None


class ClassShiftPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mainShiftCode: Literal["MORNING", "AFTERNOON"]
    secondaryShiftCode: Literal["MORNING", "AFTERNOON"]
    allowSecondary: bool = True

    @model_validator(mode="after")
    def validate_distinct_shifts(self) -> "ClassShiftPolicy":
        if self.mainShiftCode == self.secondaryShiftCode:
            raise ValueError("Buổi chính và buổi phụ phải khác nhau")
        return self


class TeacherSubjectGradeAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacherId: str = Field(min_length=1)
    subjectId: str = Field(min_length=1)
    grade: int = Field(ge=6, le=12)


class RoomCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    capabilities: list[str]
    unavailableSlotIds: list[str] | None = None


class SolveJobOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeLimitSeconds: float | None = Field(default=DEFAULT_TIME_LIMIT_SECONDS, gt=0)


class LockedAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lessonId: str = Field(min_length=1)
    sessionIndex: int = Field(ge=0)
    slotId: str = Field(min_length=1)
    roomId: str | None = None
    scope: Literal["LESSON", "TEACHER", "DAY"]
    scopeId: str = Field(min_length=1)


class LockedAssignments(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["LOCKED-ASSIGNMENTS-1.0.0"]
    assignments: list[LockedAssignment]

    @model_validator(mode="after")
    def validate_unique_occurrences(self) -> "LockedAssignments":
        keys = [(item.lessonId, item.sessionIndex) for item in self.assignments]
        if len(keys) != len(set(keys)):
            raise ValueError("Phân công đã khóa không được lặp cùng một buổi của yêu cầu tiết học")
        return self


class LocalRepairAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lessonId: str = Field(min_length=1)
    sessionIndex: int = Field(ge=0)
    slotId: str = Field(min_length=1)
    roomId: str | None = None


class LocalRepairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["LOCAL-REPAIR-1.0.0"]
    baselineSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    baselineAssignments: list[LocalRepairAssignment]
    affectedAssignmentKeys: list[str]
    frozenAssignmentKeys: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_scope(self) -> "LocalRepairRequest":
        baseline_keys = {
            f"{assignment.lessonId}:{assignment.sessionIndex}" for assignment in self.baselineAssignments
        }
        if len(baseline_keys) != len(self.baselineAssignments):
            raise ValueError("Đường cơ sở sửa lỗi cục bộ không được lặp cùng một buổi của yêu cầu tiết học")
        if not self.affectedAssignmentKeys:
            raise ValueError("Sửa lỗi cục bộ phải có ít nhất một khóa phân công bị ảnh hưởng")
        if len(set(self.affectedAssignmentKeys)) != len(self.affectedAssignmentKeys):
            raise ValueError("Các khóa phân công bị ảnh hưởng của sửa lỗi cục bộ phải là duy nhất")
        if len(set(self.frozenAssignmentKeys)) != len(self.frozenAssignmentKeys):
            raise ValueError("Các khóa phân công đã đóng băng của sửa lỗi cục bộ phải là duy nhất")
        unknown = (set(self.affectedAssignmentKeys) | set(self.frozenAssignmentKeys)) - baseline_keys
        if unknown:
            raise ValueError(f"Phạm vi sửa lỗi cục bộ tham chiếu các phân công đường cơ sở không tồn tại: {sorted(unknown)}")
        return self


class SolverObjectiveWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacherGap: float = Field(default=0, ge=0)
    compactness: float = Field(default=0, ge=0)
    dayDistribution: float = Field(default=0, ge=0)
    undesirableSlots: float = Field(default=0, ge=0)
    preferredDays: float = Field(default=0, ge=0)
    fairness: float = Field(default=0, ge=0)


class SolverObjective(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["SOLVER-OBJECTIVE-1.0.0"]
    weights: SolverObjectiveWeights


class SolveJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    jobId: str = Field(min_length=1)
    schoolId: str = Field(min_length=1)
    ruleSnapshotId: str | None = Field(default=None, min_length=1)
    ruleSetVersion: str | None = Field(default=None, pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    timeSlots: list[TimeSlot]
    lessons: list[LessonRequirement]
    teacherAvailability: TeacherAvailabilitySet | None = None
    ruleDefinitions: list[RuleDefinition] | None = None
    classUnavailableSlotIds: dict[str, list[str]] | None = None
    classGrades: dict[str, int] | None = None
    classShiftPolicies: dict[str, ClassShiftPolicy] | None = None
    teacherSubjectGradeAssignments: list[TeacherSubjectGradeAssignment] | None = None
    teacherSubjectGradeEnforcement: Literal["OFF", "WARNING", "HARD"] | None = None
    rooms: list[RoomCapability] | None = None
    lockedAssignments: LockedAssignments | None = None
    localRepair: LocalRepairRequest | None = None
    options: SolveJobOptions | None = None
    objective: SolverObjective | None = None

    @model_validator(mode="after")
    def validate_rule_snapshot_reference(self) -> "SolveJobRequest":
        fields = (self.ruleSnapshotId, self.ruleSetVersion, self.ruleSnapshotHash)
        if any(value is not None for value in fields) and not all(value is not None for value in fields):
            raise ValueError("Siêu dữ liệu bản chụp quy tắc phải có đồng thời mã, phiên bản và mã băm")
        return self


class Assignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lessonId: str
    sessionIndex: int = Field(ge=0)
    slotId: str
    roomId: str | None = None


class SolverModelMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variableCount: int = Field(ge=0)
    candidatePairCount: int = Field(ge=0)
    domainPrunedCount: int = Field(ge=0)
    roomDomainCount: int = Field(ge=0)


class ObjectiveBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacherGap: int = Field(ge=0)
    compactness: int = Field(ge=0)
    dayDistribution: int = Field(ge=0)
    undesirableSlots: int = Field(ge=0)
    preferredDays: int = Field(ge=0)
    fairness: int = Field(ge=0)
    weightedTotal: int = Field(ge=0)


class SolverRunMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    wallTimeMs: float = Field(ge=0)
    bestObjectiveBound: float | None = None
    objectiveGapPercent: float | None = Field(default=None, ge=0)


class LocalRepairDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["LOCAL-REPAIR-1.0.0"]
    baselineSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    affectedAssignmentKeys: list[str]
    frozenAssignmentKeys: list[str]
    movedAssignmentCount: int = Field(ge=0)
    preservedAssignmentCount: int = Field(ge=0)
    outsideScopeUnchanged: bool


class RelaxationProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proposalId: str
    rank: int = Field(ge=1)
    kind: Literal["SOFT_RULE_WEIGHT", "STAKEHOLDER_DATA_CHANGE", "STAKEHOLDER_HARD_RULE_REVIEW"]
    targetCode: str
    priorityScore: int = Field(ge=0)
    affectedLessonCount: int = Field(ge=0)
    affectedEntityIds: list[str]
    ruleSource: dict[str, str] = Field(default_factory=dict)
    impact: str
    requiresApproval: bool
    autoApply: bool
    hardRuleProtected: bool


class SolveDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warnings: list[str]
    conflicts: list[str]
    catalogVersion: Literal["CONFLICT-CATALOG-1.0.0"] = CONFLICT_CATALOG_VERSION
    conflictDetails: list[ConflictDiagnostic] = Field(default_factory=list)
    hardConstraintViolations: list[str] = Field(default_factory=list)
    objectiveBreakdown: ObjectiveBreakdown = Field(
        default_factory=lambda: ObjectiveBreakdown(
            teacherGap=0,
            compactness=0,
            dayDistribution=0,
            undesirableSlots=0,
            preferredDays=0,
            fairness=0,
            weightedTotal=0,
        )
    )
    runMetrics: SolverRunMetrics
    localRepair: LocalRepairDiagnostics | None = None
    relaxationProposals: list[RelaxationProposal] = Field(default_factory=list)
    modelMetrics: SolverModelMetrics | None = None
    preSolve: PreSolveReport | None = None


class SolverMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solverVersion: str = Field(min_length=1)
    contractVersion: Literal["1.0"]
    randomSeed: int
    timeLimitSeconds: float | None = Field(gt=0)
    adapterContractVersion: Literal["SOLVER-ADAPTER-1.0.0"] | None = None
    templateVersion: str | None = Field(default=None, min_length=1)
    academicPeriodId: str | None = Field(default=None, min_length=1)
    inputChecksum: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    ruleSnapshotId: str | None = Field(default=None, min_length=1)
    ruleSetVersion: str | None = Field(default=None, pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    objectiveContractVersion: Literal["SOLVER-OBJECTIVE-1.0.0"] | None = None


class SolveJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    jobId: str
    status: Literal["INVALID", "OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    assignments: list[Assignment]
    objectiveValue: float | None
    diagnostics: SolveDiagnostics
    metadata: SolverMetadata
