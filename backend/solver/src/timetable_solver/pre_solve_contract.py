from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PRE_SOLVE_CONTRACT_VERSION = "PRE-SOLVE-1.0.0"


class PreSolveIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    severity: Literal["ERROR", "WARNING"]
    message: str = Field(min_length=1)
    lessonId: str | None = None
    resourceId: str | None = None
    details: dict[str, object] | None = None


class PreSolveReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["PRE-SOLVE-1.0.0"]
    canSolve: bool
    totalDemandSessions: int = Field(ge=0)
    slotCapacity: int = Field(ge=0)
    issues: list[PreSolveIssue]
    warnings: list[str]
