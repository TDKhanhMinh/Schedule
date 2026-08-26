import unittest

from timetable_solver.conflict_catalog import conflict_diagnostic


class ConflictCatalogTest(unittest.TestCase):
    def test_conflict_chain_is_deterministic_and_connects_entities_to_outcome(self):
        first = conflict_diagnostic(
            "ROOM_CAPABILITY_UNSATISFIED",
            "Không có phòng phù hợp.",
            {"lessonId": "lesson-1", "room": "room-1"},
        )
        second = conflict_diagnostic(
            "ROOM_CAPABILITY_UNSATISFIED",
            "Không có phòng phù hợp.",
            {"room": "room-1", "lessonId": "lesson-1"},
        )

        self.assertEqual(first.conflictChain, second.conflictChain)
        self.assertEqual(first.conflictChain.contractVersion, "CONFLICT-CHAIN-1.0.0")
        self.assertTrue(any(node.type == "CONSTRAINT" for node in first.conflictChain.nodes))
        self.assertTrue(any(edge["relation"] == "RESULTS_IN" for edge in first.conflictChain.edges))


if __name__ == "__main__":
    unittest.main()
