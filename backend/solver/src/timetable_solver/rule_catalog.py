from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RULE_CATALOG_VERSION = "RULE-CATALOG-1.0.0"
RULE_CATALOG_SCHEMA_VERSION = "1.0"


class RuleCatalogParameter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=r"^[a-z][A-Za-z0-9]+$")
    label: str = Field(min_length=1)
    type: Literal[
        "BOOLEAN",
        "DAY_OF_WEEK",
        "DAY_OF_WEEK_LIST",
        "GRANULARITY",
        "INTEGER",
        "PERIOD",
        "SHIFT_CODE",
        "SLOT_ID",
        "TEXT",
    ]
    required: bool
    minimum: float | None = None
    maximum: float | None = None
    minItems: int | None = Field(default=None, ge=1)
    maxItems: int | None = Field(default=None, ge=1)
    options: list[str] | None = None


class RuleCatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(pattern=r"^[A-Z][A-Z0-9_.-]+$")
    codePrefixes: list[str] | None = None
    name: str = Field(min_length=1)
    group: Literal["TEACHER", "CLASS", "SUBJECT", "ROOM", "SCHEDULE"]
    targetResources: list[Literal["SCHOOL", "TEACHER", "CLASS", "SUBJECT", "ROOM"]] = Field(min_length=1)
    supportedKinds: list[Literal["HARD", "SOFT"]] = Field(min_length=1)
    defaultKind: Literal["HARD", "SOFT"]
    defaultWeight: float | None = Field(default=None, ge=0)
    implementationStatus: Literal["SUPPORTED", "PLANNED"]
    handlerKey: str = Field(pattern=r"^[A-Z][A-Z0-9_]+$")
    description: str = Field(min_length=1)
    parameters: list[RuleCatalogParameter]


class RuleCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalogVersion: Literal["RULE-CATALOG-1.0.0"]
    schemaVersion: Literal["1.0"]
    ruleTypes: list[RuleCatalogEntry] = Field(min_length=1)


def _catalog_path() -> Path:
    configured_solver_root = os.environ.get("SOLVER_ROOT")
    if configured_solver_root:
        return Path(configured_solver_root).resolve().parent / "contracts" / "rule-catalog.json"
    return Path(__file__).resolve().parents[3] / "contracts" / "rule-catalog.json"


RULE_CATALOG = RuleCatalog.model_validate(json.loads(_catalog_path().read_text(encoding="utf-8")))


def find_rule_catalog_entry(code: str) -> RuleCatalogEntry | None:
    normalized = code.strip().upper()
    return next(
        (
            entry
            for entry in RULE_CATALOG.ruleTypes
            if entry.code == normalized
            or any(normalized.startswith(prefix) for prefix in (entry.codePrefixes or []))
        ),
        None,
    )


def is_rule_code_supported(code: str) -> bool:
    entry = find_rule_catalog_entry(code)
    return entry is not None and entry.implementationStatus == "SUPPORTED"
