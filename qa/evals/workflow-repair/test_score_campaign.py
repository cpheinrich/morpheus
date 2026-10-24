import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from campaign import freeze, schedule
from score_campaign import score


class ScoreCampaignTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        corpus = root / "corpus"
        corpus.mkdir()
        hidden = corpus / "hidden.py"
        hidden.write_text("trusted hidden test bytes\n")
        case = dict(id="T01", split="locked", objective="public", commonContext={},
                    startFiles={"solution.py": "pass\n"},
                    hiddenTests=dict(path="hidden.py", sha256=hashlib.sha256(hidden.read_bytes()).hexdigest()))
        (corpus / "corpus.json").write_text(json.dumps(dict(cases=[case])))
        campaign = root / "campaign"
        with patch("campaign.schedule", return_value=[r for r in schedule() if r["case"] == "T01"]):
            freeze(corpus, campaign)
        return campaign, corpus

    def test_absent_episode_workspace_source_and_result_are_retained_not_dropped(self):
        with tempfile.TemporaryDirectory() as directory:
            campaign, corpus = self.fixture(directory)
            # A exists with no workspace; F has a workspace but no source; Q has
            # a source but no terminal result. P and repeat never started.
            (campaign / "episodes/T01-A").mkdir(parents=True)
            for identity in ["T01-F", "T01-Q"]:
                (campaign / "episodes" / identity).mkdir(parents=True)
                (campaign / "workspaces" / identity).mkdir(parents=True)
            (campaign / "workspaces/T01-Q/solution.py").write_text("pass\n")
            (campaign / "workspaces/T01-P/solution.py").mkdir(parents=True)
            (campaign / "episodes/T01-P").mkdir(parents=True)
            (campaign / "episodes/T01-P/result.json").write_text("{}")
            with patch("score_campaign.grade_hidden", side_effect=AssertionError("must not grade missing evidence")):
                rows = score(campaign, corpus, "locked")
            self.assertEqual([row["id"] for row in rows], ["T01-A", "T01-F", "T01-Q", "T01-P", "T01-A-repeat"])
            self.assertEqual([row["final"]["repairPassed"] for row in rows], [False] * 5)
            self.assertEqual([row["final"]["artifactMissing"] for row in rows], [True] * 5)
            self.assertIn("solution.py", rows[1]["final"]["collectorError"]["paths"])
            self.assertEqual(rows[2]["final"]["collectorError"]["paths"], ["result.json"])
            self.assertEqual(rows[3]["final"]["collectorError"]["paths"], ["solution.py"])
            self.assertEqual(json.loads((campaign / "scores-locked.json").read_text()), rows)

    def test_missing_first_row_does_not_prevent_later_valid_artifact_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            campaign, corpus = self.fixture(directory)
            plan = json.loads((campaign / "plan.json").read_text())
            workspace = campaign / "workspaces/T01-F"
            workspace.mkdir(parents=True)
            (workspace / "solution.py").write_text("pass\n")
            (workspace / "AGENTS.md").write_text(plan["instructions"])
            episode = campaign / "episodes/T01-F"
            episode.mkdir(parents=True)
            hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in workspace.iterdir()}
            (episode / "result.json").write_text(json.dumps(dict(artifactSha256=hashes)))
            workspace.chmod(0)
            try:
                with patch("score_campaign.LocalSandboxRPC"), patch("score_campaign.grade_hidden", return_value=dict(passed=True, tests_run=1, report="fixture pass")) as grade:
                    rows = score(campaign, corpus, "locked")
                self.assertEqual([row["final"]["repairPassed"] for row in rows], [False, True, False, False, False])
                self.assertEqual(grade.call_count, 1)
                self.assertEqual(workspace.stat().st_mode & 0o777, 0)
            finally:
                workspace.chmod(0o700)

    def test_hidden_file_drift_refuses_before_execution_with_unchanged_corpus(self):
        with tempfile.TemporaryDirectory() as directory:
            campaign, corpus = self.fixture(directory)
            original = (corpus / "corpus.json").read_bytes()
            plan = json.loads((campaign / "plan.json").read_text())
            workspace = campaign / "workspaces/T01-A"
            workspace.mkdir(parents=True)
            (workspace / "solution.py").write_text("pass\n")
            (workspace / "AGENTS.md").write_text(plan["instructions"])
            episode = campaign / "episodes/T01-A"
            episode.mkdir(parents=True)
            hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in workspace.iterdir()}
            (episode / "result.json").write_text(json.dumps(dict(artifactSha256=hashes)))
            (corpus / "hidden.py").write_text("changed oracle\n")
            with patch("score_campaign.grade_hidden", side_effect=AssertionError("changed hidden tests executed")):
                with self.assertRaisesRegex(ValueError, "hidden tests differ.*T01"):
                    score(campaign, corpus, "locked")
            self.assertEqual((corpus / "corpus.json").read_bytes(), original)
            self.assertFalse((campaign / "scores-locked.json").exists())
