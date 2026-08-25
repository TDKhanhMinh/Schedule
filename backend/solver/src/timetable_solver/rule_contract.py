from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RULE_SET_VERSION = "RULE-SET-1.0.0"
RuleApprovalState = Literal["PENDING_STAKEHOLDER", "APPROVED", "REVOKED"]
RuleKind = Literal["HARD", "SOFT"]


class RuleScope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schoolId: str | None = Field(default=None, min_length=1)
    academicPeriodId: str | None = Field(default=None, min_length=1)
    schoolLevel: Literal["THCS", "THPT", "THCS_THPT"] | None = None
    actorType: Literal["SYSTEM", "SCHOOL", "TEACHER"] | None = None
    actorId: str | None = Field(default=None, min_length=1)


class RuleDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(pattern=r"^[A-Z][A-Z0-9_.-]+$")
    kind: RuleKind
    weight: float | None
    sourceUrl: str = Field(min_length=1)
    sourceLocator: str | None = Field(default=None, min_length=1)
    effectiveFrom: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    effectiveTo: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    scope: RuleScope
    approvalState: RuleApprovalState
    approvedBy: str | None = Field(default=None, min_length=1)
    approvedAt: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
    approvalReason: str | None = Field(default=None, min_length=1)
    parameters: dict[str, object]

    @model_validator(mode="after")
    def validate_rule(self) -> "RuleDefinition":
        if self.effectiveTo and self.effectiveTo < self.effectiveFrom:
            raise ValueError("effectiveTo must not be earlier than effectiveFrom")
        if self.kind == "HARD" and self.weight is not None:
            raise ValueError("HARD rules must not carry a soft weight")
        if self.kind == "SOFT" and (self.weight is None or self.weight < 0):
            raise ValueError("SOFT rules require a non-negative weight")
        if self.approvalState == "APPROVED" and (not self.approvedBy or not self.approvedAt):
            raise ValueError("APPROVED rules require approvedBy and approvedAt")
        return self


class RuleSetSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshotId: str = Field(min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    profileVersion: str = Field(min_length=1)
    registerVersion: str = Field(min_length=1)
    sourceUrl: str = Field(min_length=1)
    sourceLocator: str | None = Field(default=None, min_length=1)
    effectiveFrom: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    effectiveTo: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    scope: RuleScope
    approvalState: RuleApprovalState
    approvedBy: str | None = Field(default=None, min_length=1)
    approvedAt: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
    approvalReason: str | None = Field(default=None, min_length=1)
    rules: list[RuleDefinition] = Field(min_length=1)
    snapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    capturedAt: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
    capturedBy: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_snapshot(self) -> "RuleSetSnapshot":
        if self.effectiveTo and self.effectiveTo < self.effectiveFrom:
            raise ValueError("effectiveTo must not be earlier than effectiveFrom")
        if self.approvalState == "APPROVED" and (not self.approvedBy or not self.approvedAt):
            raise ValueError("APPROVED snapshots require approvedBy and approvedAt")
        codes = [rule.code for rule in self.rules]
        if len(codes) != len(set(codes)):
            raise ValueError("rule codes must be unique within a snapshot")
        return self


def compute_rule_set_snapshot_hash(snapshot: RuleSetSnapshot) -> str:
    payload = snapshot.model_dump(mode="json", exclude={"snapshotHash"})
    canonical = json.dumps(_canonicalize(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _canonicalize(value: object) -> object:
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, dict):
        # Optional nulls and omitted fields are equivalent; HARD weight null is semantic.
        return {
            key: _canonicalize(value[key])
            for key in sorted(value)
            if value[key] is not None or key == "weight"
        }
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def get_effective_rules(snapshot: RuleSetSnapshot, as_of: date | str) -> list[RuleDefinition]:
    if snapshot.approvalState != "APPROVED":
        return []
    as_of_value = as_of.isoformat() if isinstance(as_of, date) else as_of
    return [
        rule
        for rule in snapshot.rules
        if rule.approvalState == "APPROVED"
        and rule.effectiveFrom <= as_of_value
        and (rule.effectiveTo is None or as_of_value <= rule.effectiveTo)
    ]
