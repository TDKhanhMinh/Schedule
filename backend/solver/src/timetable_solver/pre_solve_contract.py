from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .conflict_catalog import CONFLICT_CATALOG_VERSION

PRE_SOLVE_CONTRACT_VERSION = "PRE-SOLVE-1.0.0"


class PreSolveIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    severity: Literal["ERROR", "WARNING"]
    catalogVersion: Literal["CONFLICT-CATALOG-1.0.0"] = CONFLICT_CATALOG_VERSION
    entity: Literal["IMPORT", "JOB", "LESSON", "CLASS", "TEACHER", "ROOM", "SLOT", "RULE"] = "JOB"
    message: str = Field(min_length=1)
    remediationHint: str = "Kiểm tra lại dữ liệu và rule liên quan rồi thử lại."
    entityReferences: dict[str, str] = Field(default_factory=dict)
    lessonId: str | None = None
    resourceId: str | None = None
    details: dict[str, object] | None = None


class PreSolveReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["PRE-SOLVE-1.0.0"]
    catalogVersion: Literal["CONFLICT-CATALOG-1.0.0"] = CONFLICT_CATALOG_VERSION
    canSolve: bool
    totalDemandSessions: int = Field(ge=0)
    slotCapacity: int = Field(ge=0)
    issues: list[PreSolveIssue]
    warnings: list[str]
