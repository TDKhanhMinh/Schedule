"""Versioned NestJS-to-Python solver adapter envelope."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .contracts import SolveJobRequest

SOLVER_ADAPTER_CONTRACT_VERSION = "SOLVER-ADAPTER-1.0.0"


class SolverAdapterSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal["1.0"]
    templateVersion: str = Field(min_length=1)
    schoolId: str = Field(min_length=1)
    academicPeriodId: str = Field(min_length=1)
    ruleSnapshotId: str = Field(min_length=1)
    ruleSetVersion: str = Field(pattern=r"^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$")
    ruleSnapshotHash: str = Field(pattern=r"^[0-9a-f]{64}$")


class SolverAdapterReproducibility(BaseModel):
    model_config = ConfigDict(extra="forbid")

    randomSeed: int
    timeLimitSeconds: float = Field(gt=0)


class SolverAdapterPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapterContractVersion: Literal["SOLVER-ADAPTER-1.0.0"]
    source: SolverAdapterSource
    reproducibility: SolverAdapterReproducibility
    input: SolveJobRequest
    inputChecksum: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_checksum(self) -> "SolverAdapterPayload":
        expected = compute_solver_adapter_checksum(self)
        if self.inputChecksum != expected:
            raise ValueError("inputChecksum does not match the canonical adapter payload")
        if self.source.schoolId != self.input.schoolId:
            raise ValueError("adapter source schoolId must match input schoolId")
        if self.source.schemaVersion != self.input.schemaVersion:
            raise ValueError("adapter source schemaVersion must match input schemaVersion")
        return self


def canonicalize(value: object) -> object:
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    if isinstance(value, dict):
        return {
            key: canonicalize(nested)
            for key, nested in sorted(value.items())
            if nested is not None
        }
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _unsigned_payload(payload: SolverAdapterPayload) -> dict[str, object]:
    return {
        "adapterContractVersion": payload.adapterContractVersion,
        "source": payload.source.model_dump(mode="json", exclude_none=True),
        "reproducibility": payload.reproducibility.model_dump(mode="json", exclude_none=True),
        "input": payload.input.model_dump(mode="json", exclude_none=True),
    }


def compute_solver_adapter_checksum(payload: SolverAdapterPayload | dict[str, object]) -> str:
    if isinstance(payload, SolverAdapterPayload):
        unsigned = _unsigned_payload(payload)
    else:
        unsigned = {key: value for key, value in payload.items() if key != "inputChecksum"}
    canonical = json.dumps(canonicalize(unsigned), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
