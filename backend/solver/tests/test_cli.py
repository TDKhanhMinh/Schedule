import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from timetable_solver.contracts import SolveJobResult


SOLVER_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = SOLVER_ROOT / "examples" / "minimal-request.json"
ADAPTER_FIXTURE = SOLVER_ROOT.parent / "contracts" / "examples" / "solver-adapter.json"


class SolverCliTest(unittest.TestCase):
    def run_cli(self, payload: str, *args: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(SOLVER_ROOT / "src")
        return subprocess.run(
            [sys.executable, "-m", "timetable_solver.main", *args],
            cwd=SOLVER_ROOT,
            env=environment,
            input=payload,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_valid_fixture_round_trips_result_contract_and_metadata(self):
        payload = FIXTURE.read_text(encoding="utf-8")
        completed = self.run_cli(payload, "--random-seed", "7")

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = SolveJobResult.model_validate(json.loads(completed.stdout))
        self.assertIn(result.status, {"OPTIMAL", "FEASIBLE"})
        self.assertEqual(result.metadata.contractVersion, "1.0")
        self.assertEqual(result.metadata.solverVersion, "0.1.0")
        self.assertEqual(result.metadata.randomSeed, 7)
        self.assertEqual(result.metadata.timeLimitSeconds, 10.0)

    def test_invalid_payload_returns_machine_readable_schema_error(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payload["schemaVersion"] = "9.9"
        completed = self.run_cli(json.dumps(payload))

        self.assertEqual(completed.returncode, 2)
        error = json.loads(completed.stderr)
        self.assertEqual(error["error"]["code"], "INVALID_SOLVE_REQUEST")
        self.assertTrue(error["error"]["details"])

    def test_adapter_fixture_round_trips_snapshot_and_reproducibility_metadata(self):
        payload = ADAPTER_FIXTURE.read_text(encoding="utf-8")
        completed = self.run_cli(payload)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = SolveJobResult.model_validate(json.loads(completed.stdout))
        self.assertEqual(result.metadata.adapterContractVersion, "SOLVER-ADAPTER-1.0.0")
        self.assertEqual(result.metadata.templateVersion, "MVP-0.1.0")
        self.assertEqual(result.metadata.randomSeed, 7)
        self.assertEqual(result.metadata.inputChecksum, json.loads(payload)["inputChecksum"])


if __name__ == "__main__":
    unittest.main()
