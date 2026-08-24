from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0"
SOLVER_VERSION = "0.1.0"
DEFAULT_TIME_LIMIT_SECONDS = 10.0


class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    day: int = Field(ge=1, le=7)
    period: int = Field(ge=1)


class LessonRequirement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    classId: str = Field(min_length=1)
    subjectId: str = Field(min_length=1)
    teacherId: str = Field(min_length=1)
    requiredSessions: int = Field(ge=1)
    allowedSlotIds: list[str] | None = None
    fixedSlotId: str | None = Field(default=None, min_length=1)


class SolveJobOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeLimitSeconds: float = Field(default=DEFAULT_TIME_LIMIT_SECONDS, gt=0)


class SolveJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    jobId: str = Field(min_length=1)
    schoolId: str = Field(min_length=1)
    timeSlots: list[TimeSlot]
    lessons: list[LessonRequirement]
    options: SolveJobOptions | None = None


class Assignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lessonId: str
    sessionIndex: int = Field(ge=0)
    slotId: str


class SolveDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warnings: list[str]
    conflicts: list[str]


class SolverMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solverVersion: str = Field(min_length=1)
    contractVersion: Literal["1.0"]
    randomSeed: int
    timeLimitSeconds: float = Field(gt=0)


class SolveJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    jobId: str
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]
    assignments: list[Assignment]
    objectiveValue: float | None
    diagnostics: SolveDiagnostics
    metadata: SolverMetadata
