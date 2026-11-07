import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from campaign import audit_tools, freeze, load_plan, parse_trace, require_tools, schedule, unwrap_log


class CampaignTests(unittest.TestCase):
    def test_schedule_has_exact_primary_ablations_and_repeats(self):
        rows = schedule()
        self.assertEqual(len(rows), 26)
        self.assertEqual(len({r["id"] for r in rows}), 26)
        self.assertEqual([r["arm"] for r in rows if r["case"] == "D02"], ["F", "P", "Q", "A"])
        locked = [r for r in rows if r["split"] == "locked"]
        self.assertEqual(sum(r["arm"] in ("A", "F") and r["repeat"] == 0 for r in locked), 12)
        self.assertEqual(sum(r["arm"] in ("Q", "P") for r in locked), 4)
        self.assertEqual(sum(r["repeat"] for r in locked), 2)
        self.assertEqual(sum(r["arm"] in ("P", "F") for r in rows), 12)


    def test_freeze_excludes_oracles_and_refuses_drift(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curation = root / "curation"
            curation.mkdir()
            (curation / "corpus.json").write_text(json.dumps({"cases": [
                {"id": "D01", "split": "dev", "objective": "public", "startFiles": {"solution.py": "public"},
                 "commonContext": {}, "hiddenTests": {"secret": "ORACLE"}, "referenceSolution": "ANSWER"}]}))
            output = root / "campaign"
            freeze(curation, output)
            raw = (output / "plan.json").read_text()
            self.assertNotIn("ORACLE", raw)
            self.assertNotIn("ANSWER", raw)
            self.assertEqual(load_plan(output)["public"]["D01"]["files"], {"solution.py": "public"})
            with self.assertRaisesRegex(ValueError, "already frozen"):
                freeze(curation, output)
            (output / "plan.json").write_text(raw.replace("xhigh", "medium"))
            with self.assertRaisesRegex(ValueError, "plan changed"):
                load_plan(output)


    def test_actual_trace_usage_and_commands_are_distinct_from_claims(self):
        raw = '\n'.join(json.dumps(e) for e in [
            {"type": "thread.started", "thread_id": "native-session"},
            {"type": "item.completed", "item": {"type": "agent_message", "text": "All passed"}},
            {"type": "item.completed", "item": {"type": "command_execution", "command": "test", "exit_code": 1, "aggregated_output": "FAILED"}},
            {"type": "turn.completed", "usage": {"input_tokens": 100, "output_tokens": 10}},
        ])
        result = parse_trace(raw)
        self.assertEqual(result["sessionId"], "native-session")
        self.assertEqual(result["commands"][0]["exit_code"], 1)
        self.assertEqual(result["usage"], [{"input_tokens": 100, "output_tokens": 10}])


    def test_actual_mcp_success_and_denied_attempt_both_quarantine_profile(self):
        for status in ["completed", "failed"]:
            raw = json.dumps({"type": "item.completed", "item": {"type": "mcp_tool_call", "server": "codebase-memory-mcp", "tool": "index_repository", "status": status}})
            self.assertEqual(audit_tools(raw), {"recordedToolsAccepted": False, "capabilitiesVerified": False, "unexpectedTools": [{"type": "mcp_tool_call", "server": "codebase-memory-mcp", "tool": "index_repository", "status": status}]})
        ordinary = '\n'.join(json.dumps({"type": "item.completed", "item": {"type": kind}}) for kind in ["agent_message", "command_execution", "file_change", "todo_list", "error"])
        self.assertEqual(audit_tools(ordinary), {"recordedToolsAccepted": True, "capabilitiesVerified": False, "unexpectedTools": []})


    def test_refused_before_native_start_is_not_a_qualified_empty_trace(self):
        with tempfile.TemporaryDirectory() as d:
            output = Path(d)
            (output / "stdout.jsonl").write_text("")
            with self.assertRaisesRegex(RuntimeError, "native session did not start"):
                require_tools(output)
            self.assertEqual(json.loads((output / "tool-audit.json").read_text()),
                             {"recordedToolsAccepted": False, "capabilitiesVerified": False, "unexpectedTools": [], "nativeStarted": False})


    def test_upstream_chunks_preserve_split_json_and_receipts(self):
        raw = '\n'.join(json.dumps(e) for e in [
            {"stream": "stdout", "chunk": '{"type":"thread.'},
            {"stream": "stderr", "chunk": "receipt\n"},
            {"stream": "stdout", "chunk": 'started"}\n'},
        ])
        self.assertEqual(unwrap_log(raw), {"stdout": '{"type":"thread.started"}\n', "stderr": "receipt\n"})


    def test_live_collection_commands_are_retired(self):
        script = Path(__file__).with_name("campaign.py")
        with tempfile.TemporaryDirectory() as directory:
            for command in ("collect", "continuation", "public-check"):
                result = subprocess.run([sys.executable, str(script), command, directory], capture_output=True, text=True)
                self.assertEqual(result.returncode, 1)
                self.assertIn("Workflow collection is retired", result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
