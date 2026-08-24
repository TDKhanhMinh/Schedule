import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from run_benchmark_rubric import BENCHMARK_DIR, build_report


class BenchmarkRubricTest(unittest.TestCase):
    def test_rubric_has_explicit_gates_and_weighted_soft_groups(self):
        rubric = json.loads((BENCHMARK_DIR / "rubric.json").read_text(encoding="utf-8"))
        self.assertEqual(rubric["rubricVersion"], "1.0")
        self.assertEqual(rubric["benchmarkVersion"], "1.0")
        self.assertGreaterEqual(len(rubric["seedSet"]), 3)
        self.assertEqual(
            sum(group["weightPercent"] for group in rubric["softScoreGroups"]),
            100,
        )
        self.assertIn("runtimeSeconds", rubric["gates"])
        self.assertIn("optimality", rubric["gates"])
        self.assertIn("explainability", rubric["gates"])

    def test_all_benchmark_runs_pass_rubric(self):
        report = build_report()
        self.assertTrue(report["summary"]["allPassed"])
        self.assertEqual(report["summary"]["passedCount"], 3)
        for dataset in report["datasets"]:
            self.assertTrue(dataset["passed"], dataset["id"])
            self.assertTrue(all(dataset["checks"].get(name) for name in (
                "status", "assignmentCount", "hardConstraints", "runtime",
                "optimality", "seedStability", "explainability",
            )))
            self.assertIsNone(dataset["checks"]["softScore"])


if __name__ == "__main__":
    unittest.main()
