import hashlib
import json
import re
import unittest
from pathlib import Path

from timetable_solver.contracts import SolveJobRequest
from timetable_solver.solver import solve


BENCHMARK_DIR = Path(__file__).resolve().parents[1] / "examples" / "benchmarks"


class BenchmarkDatasetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((BENCHMARK_DIR / "manifest.json").read_text(encoding="utf-8"))

    def test_manifest_and_solver_expectations(self):
        self.assertEqual(self.manifest["benchmarkVersion"], "1.0")
        self.assertEqual(self.manifest["contractVersion"], "1.0")
        self.assertEqual(len(self.manifest["datasets"]), 3)

        for metadata in self.manifest["datasets"]:
            with self.subTest(dataset=metadata["id"]):
                path = BENCHMARK_DIR / metadata["file"]
                content = path.read_bytes()
                self.assertEqual(hashlib.sha256(content).hexdigest().upper(), metadata["sha256"])
                self.assertNotRegex(content.decode("utf-8"), r"@|phone|email|student|teacher name")

                payload = json.loads(content)
                request = SolveJobRequest.model_validate(payload)
                result = solve(request)

                self.assertEqual(result.status, metadata["expectedStatus"])
                self.assertEqual(len(result.assignments), metadata["expectedAssignmentCount"])
                self.assertEqual(
                    sum(lesson.requiredSessions for lesson in request.lessons),
                    metadata["rowCounts"]["requiredSessions"],
                )
                for expected_conflict in metadata["expectedConflictContains"]:
                    self.assertTrue(
                        any(expected_conflict in conflict for conflict in result.diagnostics.conflicts),
                        msg=f"Expected conflict not found: {expected_conflict}",
                    )


if __name__ == "__main__":
    unittest.main()
