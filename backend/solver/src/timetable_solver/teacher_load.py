from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TEACHER_LOAD_CONTRACT_VERSION = "TEACHER-LOAD-1.0.0"


class TeacherLoadRuleSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    sourceUrl: str = Field(min_length=1)
    sourceLocator: str | None = Field(default=None, min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    snapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")


class TeacherLoadReduction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    roleCode: str = Field(min_length=1)
    reductionSessionsPerWeek: float = Field(ge=0)
    source: TeacherLoadRuleSource


class TeacherLoadCalculation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["TEACHER-LOAD-1.0.0"]
    schoolId: str = Field(min_length=1)
    academicPeriodId: str = Field(min_length=1)
    teacherId: str = Field(min_length=1)
    teacherCode: str = Field(min_length=1)
    teacherName: str = Field(min_length=1)
    schoolLevel: Literal["THCS", "THPT", "THCS_THPT"]
    weeklyNormSessions: float = Field(gt=0)
    weeklyReductionSessions: float = Field(ge=0)
    targetAverageWeeklySessions: float = Field(ge=0)
    assignedAverageWeeklySessions: float = Field(ge=0)
    teachingWeeksForNorm: int = Field(ge=1)
    annualNormSessions: float = Field(gt=0)
    annualReductionSessions: float = Field(ge=0)
    annualTargetSessions: float = Field(ge=0)
    annualAssignedSessions: float = Field(ge=0)
    weeklyVarianceSessions: float
    status: Literal["UNDER_TARGET", "AT_TARGET", "OVER_TARGET"]
    enforcement: Literal["REPORT_ONLY", "HARD_CAP"]
    hardWeeklyLimitSessions: float | None = Field(default=None, ge=0)
    reductions: list[TeacherLoadReduction]
    ruleSources: list[TeacherLoadRuleSource]
    warnings: list[str]
