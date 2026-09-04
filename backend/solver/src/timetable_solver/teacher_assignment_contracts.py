"""Versioned contract for assigning eligible teachers to class-subject demands."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


CONTRACT_VERSION = "TEACHER-ASSIGNMENT-1.0.0"
ALGORITHM_VERSION = "TEACHER-ASSIGNMENT-1.0.0"
DEFAULT_TIME_LIMIT_SECONDS = 120.0


class TeacherAssignmentOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeLimitSeconds: float | None = Field(default=DEFAULT_TIME_LIMIT_SECONDS, gt=0)


class TeacherAssignmentDemand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    classId: str = Field(min_length=1)
    grade: int = Field(ge=6, le=12)
    subjectId: str = Field(min_length=1)
    requiredSessions: int = Field(gt=0)
    roomId: str | None = None
    fixedSlotId: str | None = None
    activityType: Literal["LESSON", "FLAG_CEREMONY"] = "LESSON"


class TeacherAssignmentTeacher(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    assignedWeeklySessions: float = Field(ge=0)
    adjustedWeeklyTarget: float = Field(ge=0)
    hardWeeklyLimitSessions: float | None = Field(default=None, ge=0)


class TeacherAssignmentEligibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacherId: str = Field(min_length=1)
    subjectId: str = Field(min_length=1)
    grade: int = Field(ge=6, le=12)


class TeacherAssignmentManualAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    demandId: str = Field(min_length=1)
    teacherId: str = Field(min_length=1)
    requiredSessions: int = Field(gt=0)
    locked: bool = True


class TeacherAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["TEACHER-ASSIGNMENT-1.0.0"]
    algorithmVersion: Literal["TEACHER-ASSIGNMENT-1.0.0"]
    jobId: str = Field(min_length=1)
    schoolId: str = Field(min_length=1)
    academicPeriodId: str = Field(min_length=1)
    ruleSnapshotId: str = Field(min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    randomSeed: int = 0
    options: TeacherAssignmentOptions = Field(default_factory=TeacherAssignmentOptions)
    demands: list[TeacherAssignmentDemand]
    teachers: list[TeacherAssignmentTeacher]
    eligibility: list[TeacherAssignmentEligibility]
    manualAssignments: list[TeacherAssignmentManualAssignment] = Field(default_factory=list)


class TeacherAssignmentProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    demandId: str
    teacherId: str | None = None
    requiredSessions: int = Field(gt=0)
    source: Literal["AUTO", "MANUAL"]
    isLocked: bool
    status: Literal["PROPOSED", "ACCEPTED", "REJECTED", "UNASSIGNED"]
    score: float | None = None
    reasonCode: str | None = None
    reason: str | None = None
    loadBefore: float | None = None
    loadAfter: float | None = None
    adjustedTarget: float | None = None


class TeacherAssignmentDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warnings: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    unassignedDemandIds: list[str] = Field(default_factory=list)
    modelMetrics: dict[str, int]
    runMetrics: dict[str, float]


class TeacherAssignmentMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solverVersion: str
    contractVersion: Literal["TEACHER-ASSIGNMENT-1.0.0"]
    algorithmVersion: Literal["TEACHER-ASSIGNMENT-1.0.0"]
    randomSeed: int
    timeLimitSeconds: float | None = Field(gt=0)
    ruleSnapshotId: str
    ruleSetVersion: str
    ruleSnapshotHash: str


class TeacherAssignmentResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["TEACHER-ASSIGNMENT-1.0.0"]
    jobId: str
    status: Literal["OPTIMAL", "FEASIBLE", "PARTIAL", "INFEASIBLE", "UNKNOWN"]
    proposals: list[TeacherAssignmentProposal]
    diagnostics: TeacherAssignmentDiagnostics
    metadata: TeacherAssignmentMetadata
