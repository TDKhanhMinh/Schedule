from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TEACHER_AVAILABILITY_CONTRACT_VERSION = "TEACHER-AVAILABILITY-1.0.0"
TeacherAvailabilityStrength = Literal["HARD_UNAVAILABLE", "STRONG_PREFERENCE", "SOFT_WISH"]


class TeacherAvailabilityRuleSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceUrl: str = Field(min_length=1)
    sourceLocator: str | None = Field(default=None, min_length=1)
    ruleSnapshotId: str = Field(min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")


class TeacherAvailabilityRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ruleId: str = Field(min_length=1)
    code: str = Field(min_length=1)
    teacherId: str = Field(min_length=1)
    strength: TeacherAvailabilityStrength
    weight: float | None = Field(default=None, ge=0)
    dayOfWeek: int = Field(ge=1, le=7)
    shiftCode: str | None = Field(default=None, min_length=1)
    period: int | None = Field(default=None, ge=1)
    blockedSlotIds: list[str]
    effectiveFrom: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    effectiveTo: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    reason: str | None = Field(default=None, min_length=1)
    source: TeacherAvailabilityRuleSource

    @model_validator(mode="after")
    def validate_strength(self) -> "TeacherAvailabilityRule":
        if self.strength == "HARD_UNAVAILABLE" and self.weight is not None:
                raise ValueError("Quy tắc HARD_UNAVAILABLE không được có trọng số")
        if self.strength != "HARD_UNAVAILABLE" and self.weight is None:
                raise ValueError("Quy tắc ưu tiên yêu cầu trọng số")
        if self.effectiveTo and self.effectiveTo < self.effectiveFrom:
                raise ValueError("effectiveTo không được sớm hơn effectiveFrom")
        return self


class TeacherAvailabilitySet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractVersion: Literal["TEACHER-AVAILABILITY-1.0.0"]
    schoolId: str = Field(min_length=1)
    academicPeriodId: str = Field(min_length=1)
    effectiveAsOf: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    ruleSnapshotId: str = Field(min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    rules: list[TeacherAvailabilityRule]

    @model_validator(mode="after")
    def validate_rule_provenance(self) -> "TeacherAvailabilitySet":
        for rule in self.rules:
            if rule.source.ruleSnapshotId != self.ruleSnapshotId:
                raise ValueError("Bản chụp nguồn của quy tắc sẵn sàng không khớp với bản chụp yêu cầu")
            if rule.source.ruleSetVersion != self.ruleSetVersion:
                raise ValueError("Phiên bản nguồn của quy tắc sẵn sàng không khớp với bản chụp yêu cầu")
            if rule.source.ruleSnapshotHash != self.ruleSnapshotHash:
                raise ValueError("Mã băm nguồn của quy tắc sẵn sàng không khớp với bản chụp yêu cầu")
        return self
