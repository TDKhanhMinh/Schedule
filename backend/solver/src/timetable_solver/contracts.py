from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .conflict_catalog import CONFLICT_CATALOG_VERSION, ConflictDiagnostic
from .teacher_availability import TeacherAvailabilitySet
from .pre_solve_contract import PreSolveReport

CONTRACT_VERSION = "1.0"
SOLVER_VERSION = "0.1.0"
DEFAULT_TIME_LIMIT_SECONDS = 10.0


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


class RoomCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    capabilities: list[str]
    unavailableSlotIds: list[str] | None = None


class SolveJobOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeLimitSeconds: float = Field(default=DEFAULT_TIME_LIMIT_SECONDS, gt=0)


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
    classUnavailableSlotIds: dict[str, list[str]] | None = None
    rooms: list[RoomCapability] | None = None
    options: SolveJobOptions | None = None

    @model_validator(mode="after")
    def validate_rule_snapshot_reference(self) -> "SolveJobRequest":
        fields = (self.ruleSnapshotId, self.ruleSetVersion, self.ruleSnapshotHash)
        if any(value is not None for value in fields) and not all(value is not None for value in fields):
            raise ValueError("rule snapshot metadata must include id, version and hash together")
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


class SolveDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warnings: list[str]
    conflicts: list[str]
    catalogVersion: Literal["CONFLICT-CATALOG-1.0.0"] = CONFLICT_CATALOG_VERSION
    conflictDetails: list[ConflictDiagnostic] = Field(default_factory=list)
    hardConstraintViolations: list[str] = Field(default_factory=list)
    modelMetrics: SolverModelMetrics | None = None
    preSolve: PreSolveReport | None = None


class SolverMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solverVersion: str = Field(min_length=1)
    contractVersion: Literal["1.0"]
    randomSeed: int
    timeLimitSeconds: float = Field(gt=0)
    adapterContractVersion: Literal["SOLVER-ADAPTER-1.0.0"] | None = None
    templateVersion: str | None = Field(default=None, min_length=1)
    academicPeriodId: str | None = Field(default=None, min_length=1)
    inputChecksum: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    ruleSnapshotId: str | None = Field(default=None, min_length=1)
    ruleSetVersion: str | None = Field(default=None, pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class SolveJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    jobId: str
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    assignments: list[Assignment]
    objectiveValue: float | None
    diagnostics: SolveDiagnostics
    metadata: SolverMetadata
