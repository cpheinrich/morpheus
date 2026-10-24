import json
from pathlib import Path
import tempfile
import unittest

from summarize import summarize


class SummaryTests(unittest.TestCase):
    def test_paired_success_and_repeats_remain_distinct(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = []
            for identity, passed, repeat in [("T01-A", False, 0), ("T01-F", True, 0), ("T01-A-repeat", True, 1)]:
                rows.append(dict(id=identity, case="T01", arm=identity.split("-")[1], repeat=repeat,
                                 final=dict(repairPassed=passed, handoffMaterialPresent=False)))
            (root / "scores-locked.json").write_text(json.dumps(rows))
            result = summarize(root)
            self.assertEqual(result["paired"], dict(bothPass=0, bothFail=0, FOnly=1, AOnly=0))
            self.assertEqual(result["arms"]["A"]["accepted"], 0)
            self.assertEqual(result["arms"]["A-repeat"]["accepted"], 1)

    def test_manager_usage_counts_and_timeout_usage_stays_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            attempt = dict(repairPassed=True, handoffMaterialPresent=True, metadata=dict(elapsedSeconds=170))
            (root / "scores-locked.json").write_text(json.dumps([dict(id="T01-F", case="T01", arm="F", repeat=0, initial=attempt, final=attempt)]))
            episode = root / "episodes/T01-F"
            (episode / "manager").mkdir(parents=True)
            (episode / "trace.json").write_text(json.dumps(dict(usage=[])))
            (episode / "manager/trace.json").write_text(json.dumps(dict(usage=[dict(input_tokens=100, output_tokens=20)])))
            result = summarize(root)
            values = result["arms"]["F"]
            self.assertEqual((values["calls"], values["unknownUsage"], values["inputTokens"], values["outputTokens"], values["seconds"]), (2, 1, 100, 20, 170))
            self.assertFalse(result["costComparisonComplete"])


class MissingEvidenceTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        attempt = dict(repairPassed=True, handoffMaterialPresent=False, metadata=dict(elapsedSeconds=1))
        (root / "scores-locked.json").write_text(json.dumps([dict(id="T01-F", case="T01", arm="F", repeat=0, initial=attempt, final=attempt)]))
        episode = root / "episodes/T01-F"
        (episode / "manager").mkdir(parents=True)
        return root, episode

    def test_each_expected_trace_missing_is_unknown(self):
        for missing in ["worker", "manager", "both"]:
            with tempfile.TemporaryDirectory() as directory:
                root, episode = self.fixture(directory)
                usage = dict(usage=[dict(input_tokens=10, output_tokens=2)])
                if missing not in ("worker", "both"):
                    (episode / "trace.json").write_text(json.dumps(usage))
                if missing not in ("manager", "both"):
                    (episode / "manager/trace.json").write_text(json.dumps(usage))
                result = summarize(root)
                self.assertEqual(result["arms"]["F"]["unknownUsage"], 2 if missing == "both" else 1)
                self.assertFalse(result["costComparisonComplete"])

    def test_proven_nonstart_is_distinct_from_missing_trace(self):
        with tempfile.TemporaryDirectory() as directory:
            root, episode = self.fixture(directory)
            for folder in [episode, episode / "manager"]:
                (folder / "receipt.json").write_text(json.dumps(dict(termination="not-started")))
            result = summarize(root)
            self.assertEqual(result["arms"]["F"]["unknownUsage"], 0)
            self.assertEqual(result["arms"]["F"]["calls"], 0)
            self.assertTrue(result["costComparisonComplete"])

    def test_missing_initial_attempt_is_unknown_not_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scores-locked.json").write_text(json.dumps([dict(id="T01-A", case="T01", arm="A", repeat=0, final=None)]))
            result = summarize(root)
            self.assertEqual(result["arms"]["A"]["unknownUsage"], 1)
            self.assertEqual(result["arms"]["A"]["missingResults"], 1)
            self.assertFalse(result["costComparisonComplete"])


if __name__ == "__main__":
    unittest.main()
