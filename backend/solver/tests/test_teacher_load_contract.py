import json
import unittest
from pathlib import Path

from timetable_solver.teacher_load import TeacherLoadCalculation


class TeacherLoadContractTest(unittest.TestCase):
    def test_shared_teacher_load_fixture_preserves_average_target_and_sources(self):
        fixture = Path(__file__).parents[2] / "contracts" / "examples" / "teacher-load-calculation.json"
        calculation = TeacherLoadCalculation.model_validate(json.loads(fixture.read_text(encoding="utf-8")))

        self.assertEqual(calculation.contractVersion, "TEACHER-LOAD-1.0.0")
        self.assertEqual(calculation.weeklyNormSessions, 19)
        self.assertEqual(calculation.targetAverageWeeklySessions, 17)
        self.assertEqual(calculation.enforcement, "REPORT_ONLY")
        self.assertEqual(calculation.reductions[0].roleCode, "HEAD_DEPARTMENT")
        self.assertEqual(
            [source.code for source in calculation.ruleSources],
            ["RULE-TEACH-002", "RULE-TEACH-003", "RULE-TEACH-REDUCTION-HEAD-DEPARTMENT"],
        )


if __name__ == "__main__":
    unittest.main()
