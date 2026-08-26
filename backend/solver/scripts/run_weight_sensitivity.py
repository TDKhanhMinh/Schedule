"""Run versioned soft-objective sensitivity profiles without changing hard constraints."""

from __future__ import annotations

import argparse
import json
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.solver import solve


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_DIR = ROOT / "examples" / "benchmarks"
SEEDS = [0, 1, 7]
PROFILES = {
    "baseline-v1": {
        "rationale": "Existing P2.2-T05 rubric weights; reference only.",
        "weights": {
            "teacherGap": 1,
            "compactness": 1,
            "dayDistribution": 1,
            "undesirableSlots": 1,
            "preferredDays": 1,
            "fairness": 1,
        },
    },
    "candidate-teacher-fairness-v1": {
        "rationale": "Sensitivity candidate: prioritize teacher gaps and fairness; requires school workload feedback before approval.",
        "weights": {
            "teacherGap": 3,
            "compactness": 1,
            "dayDistribution": 1,
            "undesirableSlots": 1,
            "preferredDays": 1,
            "fairness": 2,
        },
    },
    "candidate-compactness-v1": {
        "rationale": "Sensitivity candidate: prioritize compact weekly distribution; requires timetable-coordinator feedback before approval.",
        "weights": {
            "teacherGap": 1,
            "compactness": 3,
            "dayDistribution": 2,
            "undesirableSlots": 1,
            "preferredDays": 1,
            "fairness": 1,
        },
    },
}


def datasets() -> list[dict]:
    manifest = json.loads((BENCHMARK_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest["datasets"]


def run_profile(profile_id: str, profile: dict, metadata: dict) -> dict:
    payload = json.loads((BENCHMARK_DIR / metadata["file"]).read_text(encoding="utf-8"))
    request = SolveJobRequest.model_validate(
        {
            **payload,
            "objective": {
                "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
                "weights": profile["weights"],
            },
            "options": {"timeLimitSeconds": 30 if metadata["id"] == "medium-near-realistic" else 10},
        }
    )
    runs = []
    for seed in SEEDS:
        started = time.perf_counter()
        result = solve(request, random_seed=seed)
        runtime_ms = round((time.perf_counter() - started) * 1000, 3)
        runs.append(
            {
                "seed": seed,
                "status": result.status,
                "assignmentCount": len(result.assignments),
                "hardConflictCount": len(result.diagnostics.conflicts),
                "runtimeMs": runtime_ms,
                "objectiveValue": result.objectiveValue,
                "objectiveBreakdown": result.diagnostics.objectiveBreakdown.model_dump(),
            }
        )
    return {
        "profileId": profile_id,
        "dataset": metadata["id"],
        "expectedStatus": metadata["expectedStatus"],
        "expectedAssignmentCount": metadata["expectedAssignmentCount"],
        "rationale": profile["rationale"],
        "contractVersion": request.schemaVersion,
        "objectiveContractVersion": request.objective.contractVersion if request.objective else None,
        "weights": profile["weights"],
        "seedRuns": runs,
    }


def compare_profile(candidate: list[dict], baseline: list[dict]) -> dict:
    baseline_by_dataset = {item["dataset"]: item for item in baseline}
    dataset_results = []
    for item in candidate:
        reference = baseline_by_dataset[item["dataset"]]
        candidate_runs = {run["seed"]: run for run in item["seedRuns"]}
        baseline_runs = {run["seed"]: run for run in reference["seedRuns"]}
        deltas = []
        hard_constraints_unchanged = True
        for seed in SEEDS:
            before = baseline_runs[seed]
            after = candidate_runs[seed]
            hard_constraints_unchanged &= (
                before["status"] == after["status"]
                and before["assignmentCount"] == after["assignmentCount"]
                and before["hardConflictCount"] == after["hardConflictCount"]
            )
            deltas.append(
                {
                    "seed": seed,
                    "weightedTotalDelta": after["objectiveBreakdown"]["weightedTotal"]
                    - before["objectiveBreakdown"]["weightedTotal"],
                    "beforeWeightedTotal": before["objectiveBreakdown"]["weightedTotal"],
                    "afterWeightedTotal": after["objectiveBreakdown"]["weightedTotal"],
                    "runtimeRatio": round(after["runtimeMs"] / max(before["runtimeMs"], 0.001), 3),
                }
            )
        runtime_ratio = statistics.median(delta["runtimeRatio"] for delta in deltas)
        dataset_results.append(
            {
                "dataset": item["dataset"],
                "hardConstraintsUnchanged": hard_constraints_unchanged,
                "runtimeMedianRatio": runtime_ratio,
                "performanceWithinTwoTimesBaseline": runtime_ratio <= 2,
                "scoreDeltas": deltas,
            }
        )
    return {
        "profileId": candidate[0]["profileId"],
        "datasetResults": dataset_results,
        "hardConstraintsUnchanged": all(item["hardConstraintsUnchanged"] for item in dataset_results),
        "performanceWithinTwoTimesBaseline": all(
            item["performanceWithinTwoTimesBaseline"] for item in dataset_results
        ),
        "candidateAcceptedForStakeholderReview": all(
            item["hardConstraintsUnchanged"] and item["performanceWithinTwoTimesBaseline"]
            for item in dataset_results
        ),
    }


def build_report() -> dict:
    metadata = datasets()
    runs = {
        profile_id: [run_profile(profile_id, profile, dataset) for dataset in metadata]
        for profile_id, profile in PROFILES.items()
    }
    baseline = runs["baseline-v1"]
    return {
        "reportVersion": "1.0",
        "task": "P3.1-T04",
        "generatedAt": datetime.now(UTC).isoformat(),
        "scope": "local/dev synthetic sensitivity; candidate profiles are not stakeholder-approved",
        "seedSet": SEEDS,
        "hardConstraintPolicy": "Objective weights never relax hard constraints; feasible cases must keep zero hard conflicts and infeasible diagnostics must remain expected.",
        "profiles": runs,
        "comparisons": [compare_profile(runs[profile_id], baseline) for profile_id in PROFILES if profile_id != "baseline-v1"],
        "pilotGate": {
            "pilotWeightsApproved": False,
            "productionApproved": False,
            "reason": "P3.1-T02 solveAllowed=false and school/stakeholder feedback is not attached.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = build_report()
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
