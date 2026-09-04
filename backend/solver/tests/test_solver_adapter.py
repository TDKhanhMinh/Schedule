import json
import unittest
from pathlib import Path

from pydantic import ValidationError

from timetable_solver.solver import solve
from timetable_solver.solver_adapter import SolverAdapterPayload, compute_solver_adapter_checksum


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "backend" / "contracts" / "examples" / "solver-adapter.json"


class SolverAdapterTest(unittest.TestCase):
    def test_published_fixture_round_trips_and_hashes(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        adapter = SolverAdapterPayload.model_validate(payload)

        self.assertEqual(adapter.adapterContractVersion, "SOLVER-ADAPTER-1.0.0")
        self.assertEqual(adapter.source.templateVersion, "MVP-0.1.0")
        self.assertEqual(adapter.reproducibility.randomSeed, 7)
        self.assertEqual(compute_solver_adapter_checksum(payload), adapter.inputChecksum)
        self.assertEqual(len(adapter.input.teacherAvailability.rules), 2)

        result = solve(
            adapter.input,
            random_seed=adapter.reproducibility.randomSeed,
            adapter_payload=adapter,
        )
        self.assertEqual(result.status, "OPTIMAL")
        self.assertEqual(result.metadata.adapterContractVersion, "SOLVER-ADAPTER-1.0.0")
        self.assertEqual(result.metadata.inputChecksum, adapter.inputChecksum)
        self.assertEqual(result.metadata.academicPeriodId, "period-2026-2027-1")

    def test_checksum_mismatch_fails_before_solver(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payload["input"]["jobId"] = "tampered-job"

        with self.assertRaises(ValidationError):
            SolverAdapterPayload.model_validate(payload)

    def test_unlimited_time_limit_round_trips_and_is_used_by_solver(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payload["reproducibility"]["timeLimitSeconds"] = None
        payload["input"]["options"] = {"timeLimitSeconds": None}
        payload["inputChecksum"] = compute_solver_adapter_checksum(payload)

        adapter = SolverAdapterPayload.model_validate(payload)
        result = solve(
            adapter.input,
            random_seed=adapter.reproducibility.randomSeed,
            adapter_payload=adapter,
        )

        self.assertIsNone(adapter.reproducibility.timeLimitSeconds)
        self.assertIsNone(result.metadata.timeLimitSeconds)


if __name__ == "__main__":
    unittest.main()
