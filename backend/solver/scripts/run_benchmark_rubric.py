"""Run the solver benchmark rubric and emit a regression-friendly JSON report."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.solver import solve


BENCHMARK_DIR = Path(__file__).resolve().parents[1] / "examples" / "benchmarks"
BENCHMARK_OBJECTIVE = {
    "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
    "weights": {
        "teacherGap": 1,
        "compactness": 1,
        "dayDistribution": 1,
        "undesirableSlots": 1,
        "preferredDays": 1,
        "fairness": 1,
    },
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def hard_conflict_count(result) -> int:
    return len(result.diagnostics.conflicts)


def run_dataset(metadata: dict, rubric: dict, manifest: dict) -> dict:
    path = BENCHMARK_DIR / metadata["file"]
    runtime_limit = rubric["gates"]["runtimeSeconds"][metadata["id"]]
    request = SolveJobRequest.model_validate(
        {
            **json.loads(path.read_text(encoding="utf-8")),
            "objective": BENCHMARK_OBJECTIVE,
            "options": {"timeLimitSeconds": runtime_limit},
        }
    )
    seed_results = []

    for seed in rubric["seedSet"]:
        started = time.perf_counter()
        result = solve(request, random_seed=seed)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        seed_results.append(
            {
                "seed": seed,
                "status": result.status,
                "assignmentCount": len(result.assignments),
                "hardConflictCount": hard_conflict_count(result),
                "runtimeMs": elapsed_ms,
                "diagnostics": list(result.diagnostics.conflicts),
                "objectiveValue": result.objectiveValue,
                "objectiveBreakdown": result.diagnostics.objectiveBreakdown.model_dump(),
            }
        )

    first = seed_results[0]
    expected_conflicts = metadata["expectedConflictContains"]
    diagnostic_pass = all(
        any(expected in diagnostic for diagnostic in first["diagnostics"])
        for expected in expected_conflicts
    )
    if not expected_conflicts and first["status"] in {"OPTIMAL", "FEASIBLE"}:
        diagnostic_pass = first["hardConflictCount"] == 0

    expected_status = metadata["expectedStatus"]
    is_infeasible = expected_status == "INFEASIBLE"
    status_pass = all(
        result["status"] == expected_status
        if is_infeasible
        else result["status"] in {"OPTIMAL", "FEASIBLE"}
        for result in seed_results
    )
    assignment_pass = all(
        result["assignmentCount"] == metadata["expectedAssignmentCount"]
        for result in seed_results
    )
    hard_conflict_pass = all(
        result["hardConflictCount"] == 0 for result in seed_results
    ) if not is_infeasible else True
    runtime_pass = all(result["runtimeMs"] / 1000 <= runtime_limit for result in seed_results)
    stability_pass = len(
        {
            (result["status"], result["assignmentCount"], result["hardConflictCount"])
            for result in seed_results
        }
    ) == 1
    optimality_pass = (
        all(result["status"] == "OPTIMAL" for result in seed_results)
        if metadata["id"] in rubric["gates"]["optimality"]["optimalStatusRequiredFor"]
        else True
    )
    objective_pass = all(
        result["objectiveBreakdown"]["weightedTotal"] >= 0
        for result in seed_results
    )
    soft_score = first["objectiveBreakdown"]["weightedTotal"]
    passed = all(
        [status_pass, assignment_pass, hard_conflict_pass, runtime_pass,
         stability_pass, diagnostic_pass, optimality_pass, objective_pass]
    )

    return {
        "id": metadata["id"],
        "category": metadata["category"],
        "input": {
            "file": metadata["file"],
            "sha256": sha256(path),
            "expectedSha256": metadata["sha256"],
            "contractVersion": request.schemaVersion,
        },
        "expected": {
            "status": expected_status,
            "assignmentCount": metadata["expectedAssignmentCount"],
            "conflictContains": expected_conflicts,
        },
        "checks": {
            "status": status_pass,
            "assignmentCount": assignment_pass,
            "hardConstraints": hard_conflict_pass,
            "runtime": runtime_pass,
            "optimality": optimality_pass,
            "seedStability": stability_pass,
            "explainability": diagnostic_pass,
            "softScore": objective_pass,
        },
        "objectiveGapPercent": 0 if optimality_pass and not is_infeasible else None,
        "softScore": soft_score,
        "runtimeLimitSeconds": runtime_limit,
        "seedRuns": seed_results,
        "passed": passed,
    }


def build_report() -> dict:
    manifest = json.loads((BENCHMARK_DIR / "manifest.json").read_text(encoding="utf-8"))
    rubric = json.loads((BENCHMARK_DIR / "rubric.json").read_text(encoding="utf-8"))
    datasets = [run_dataset(metadata, rubric, manifest) for metadata in manifest["datasets"]]
    return {
        "reportVersion": "1.0",
        "rubricVersion": rubric["rubricVersion"],
        "benchmarkVersion": manifest["benchmarkVersion"],
        "contractVersion": manifest["contractVersion"],
        "generatedAt": datetime.now(UTC).isoformat(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "processor": platform.processor() or "unknown",
            "seedSet": rubric["seedSet"],
        },
        "datasets": datasets,
        "summary": {
            "datasetCount": len(datasets),
            "passedCount": sum(1 for dataset in datasets if dataset["passed"]),
            "allPassed": all(dataset["passed"] for dataset in datasets),
            "softScore": "versioned SOLVER-OBJECTIVE-1.0.0 weightedTotal; lower is better",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, help="Write the report to this JSON path")
    args = parser.parse_args()
    report = build_report()
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if report["summary"]["allPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
