import json
import io
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
import unittest
import sys
from unittest.mock import patch

import subprocess
from campaign import audit_tools, collect, freeze, load_plan, parse_trace, protect_operator, public_check, queued_call, require_tools, schedule, setup_call, unwrap_log


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

    def test_duplicate_title_returning_foreign_issue_stops_before_run_lookup(self):
        with tempfile.TemporaryDirectory() as d:
            calls = []
            def api(_self, method, path, value=None):
                calls.append((method, path, value))
                return {"id": "old-issue", "companyId": "company", "assigneeAgentId": "foreign", "title": "run"}
            with patch("campaign.Operator.api", api):
                with self.assertRaisesRegex(RuntimeError, "issue readback did not match"):
                    queued_call({"agentId": "owned"}, {"companyId": "company"}, {}, "prompt", Path(d))
            self.assertEqual([(m, p) for m, p, _ in calls], [("POST", "/companies/company/issues"), ("POST", "/agents/owned/pause")])
            self.assertIn("owned", calls[0][2]["title"])

    def test_wrong_company_with_same_assignee_is_also_refused(self):
        with tempfile.TemporaryDirectory() as d:
            output = Path(d)
            def api(_self, method, path, value=None):
                return {"id": "old", "companyId": "foreign", "assigneeAgentId": "owned", "title": "Workflow repair " + output.name + " / owned"}
            with patch("campaign.Operator.api", api), self.assertRaisesRegex(RuntimeError, "readback"):
                queued_call({"agentId": "owned"}, {"companyId": "company"}, {}, "prompt", output)

    def test_upstream_chunks_preserve_split_json_and_receipts(self):
        raw = '\n'.join(json.dumps(e) for e in [
            {"stream": "stdout", "chunk": '{"type":"thread.'},
            {"stream": "stderr", "chunk": "receipt\n"},
            {"stream": "stdout", "chunk": 'started"}\n'},
        ])
        self.assertEqual(unwrap_log(raw), {"stdout": '{"type":"thread.started"}\n', "stderr": "receipt\n"})

    def test_native_call_identity_refuses_second_inference(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            pilot = root / "pilot"
            pilot.mkdir()
            (pilot / "worker.py").write_text("print('exactly one native invocation')\n")
            workspace = root / "workspace"
            workspace.mkdir()
            config = {"pilotPath": str(pilot), "hostConfig": {}, "url": "http://127.0.0.1:3100", "accountStateDir": str(root / "state")}
            plan = {"maxCalls": 2, "requestedModel": "frozen-model", "effort": "xhigh", "admissionStop": 40, "hardStop": 43}
            binding = setup_call(root / "campaign", config, plan, "one", workspace, 170, False, "public task")
            first = subprocess.run([binding["launcher"], "exec", "--json"], capture_output=True, text=True)
            second = subprocess.run([binding["launcher"], "exec", "--json"], capture_output=True, text=True)
            self.assertEqual((first.returncode, first.stdout), (0, "exactly one native invocation\n"))
            self.assertEqual((second.returncode, second.stdout), (75, ""))
            self.assertIn("identity already consumed", second.stderr)

    def test_call_reservation_stops_at_exact_cap(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            config = {"pilotPath": str(root), "hostConfig": {}, "url": "http://127.0.0.1:3100", "accountStateDir": str(root / "state")}
            plan = {"maxCalls": 1, "requestedModel": "frozen-model", "effort": "xhigh", "admissionStop": 40, "hardStop": 43}
            setup_call(root, config, plan, "one", root, 170, False, "public task")
            with self.assertRaisesRegex(ValueError, "ceiling reached"):
                setup_call(root, config, plan, "two", root, 170, False, "public task")
            self.assertEqual(len(list((root / "call-ledger").glob("*.json"))), 1)

    def test_full_collection_paths_seal_artifacts_and_include_manager(self):
        for arm, expected_calls in [("A", 1), ("P", 2), ("F", 2)]:
            with tempfile.TemporaryDirectory() as d:
                root = Path(d)
                curation = root / "curation"
                curation.mkdir()
                (curation / "corpus.json").write_text(json.dumps({"cases": [{"id": "D01", "split": "dev", "objective": "public", "commonContext": {}, "startFiles": {"solution.py": "def solve(p): return 0\n"}}]}))
                output = root / "campaign"
                freeze(curation, output)
                calls = []
                def setup(*args):
                    calls.append({"id": args[3], "workspace": args[4], "seconds": args[5], "queued": args[6]})
                    return {"agentId": "fixture", "body": {}}
                def execute(*args):
                    folder = args[-1]
                    (folder / "stdout.jsonl").write_text(json.dumps({"type": "thread.started", "thread_id": "fixture-native-session"}) + "\n" + json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "bounded brief"}}) + "\n")
                    return {"exitCode": 0}
                with patch("campaign.setup_call", setup), patch("campaign.direct_call", execute), patch("campaign.queued_call", execute), redirect_stdout(io.StringIO()):
                    collect(output, {}, "D01-" + arm)
                self.assertEqual(len(calls), expected_calls)
                self.assertEqual(calls[-1]["queued"], arm == "F")
                self.assertGreater(calls[-1]["seconds"], 0)
                self.assertLessEqual(calls[-1]["seconds"], 170)
                workspace = output / "workspaces" / ("D01-" + arm)
                self.assertEqual(workspace.stat().st_mode & 0o777, 0)
                result = output / "episodes" / ("D01-" + arm) / "result.json"
                self.assertEqual(result.stat().st_mode & 0o777, 0)
                result.chmod(0o600)
                self.assertEqual(set(json.loads(result.read_text())["artifactSha256"]), {"solution.py", "AGENTS.md"})

    def test_unexpected_recorded_tool_keeps_vault_sealed_inside_collection(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            corpus = root / "corpus"
            corpus.mkdir()
            (corpus / "corpus.json").write_text(json.dumps({"cases": [{"id": "D01", "split": "dev", "objective": "public", "commonContext": {}, "startFiles": {"solution.py": "pass\n"}}]}))
            output = root / "campaign"
            freeze(corpus, output)
            vault = root / "vault"
            vault.mkdir()
            token = vault / "token"
            token.write_text("synthetic")
            def execute(*args):
                self.assertEqual(vault.stat().st_mode & 0o777, 0)
                (args[-1] / "stdout.jsonl").write_text('\n'.join(json.dumps(e) for e in [
                    {"type": "thread.started", "thread_id": "fixture"},
                    {"type": "item.completed", "item": {"type": "mcp_tool_call", "status": "completed"}}]))
                return {"exitCode": 0}
            try:
                with patch("campaign.setup_call", return_value={}), patch("campaign.direct_call", execute), redirect_stdout(io.StringIO()):
                    with self.assertRaisesRegex(RuntimeError, "unexpected tool"):
                        collect(output, {"boardTokenFile": str(token)}, "D01-A")
                self.assertEqual(vault.stat().st_mode & 0o777, 0)
                self.assertEqual((output / "workspaces/D01-A").stat().st_mode & 0o777, 0)
            finally:
                vault.chmod(0o700)

    def test_public_smoke_cannot_replace_the_frozen_check(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curation = root / "curation"
            curation.mkdir()
            (curation / "corpus.json").write_text(json.dumps({"cases": [{"id": "D01", "split": "dev", "objective": "public", "commonContext": {}, "startFiles": {"smoke_test.py": "assert False\n"}}]}))
            output = root / "campaign"
            freeze(curation, output)
            workspace = output / "workspaces/D01-A"
            workspace.mkdir(parents=True)
            (workspace / "smoke_test.py").write_text("assert True\n")
            with patch("campaign.subprocess.run", side_effect=AssertionError("must not execute changed test")):
                result = public_check(output, {"hostConfig": {"codexCommand": "unused"}}, "D01-A")
            self.assertEqual(result["exitCode"], 125)
            self.assertEqual(workspace.stat().st_mode & 0o777, 0)

    def test_public_check_seals_private_credentials_while_candidate_imports_run(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curation = root / "curation"
            curation.mkdir()
            (curation / "corpus.json").write_text(json.dumps({"cases": [{"id": "D01", "split": "dev", "objective": "public", "commonContext": {}, "startFiles": {"smoke_test.py": "assert True\n"}}]}))
            output = root / "campaign"
            freeze(curation, output)
            workspace = output / "workspaces/D01-A"
            workspace.mkdir(parents=True)
            (workspace / "smoke_test.py").write_text("assert True\n")
            vault = root / "vault"
            vault.mkdir()
            token = vault / "token"
            token.write_text("synthetic-test-token")
            def execute(*args, **kwargs):
                self.assertEqual(vault.stat().st_mode & 0o777, 0)
                kwargs["stdout"].write(b"checked")
                return subprocess.CompletedProcess(args[0], 0)
            with patch("campaign.subprocess.run", execute):
                result = public_check(output, {"hostConfig": {"codexCommand": "unused"}, "boardTokenFile": str(token)}, "D01-A")
            self.assertEqual((result["exitCode"], result["stdout"]), (0, "checked"))
            self.assertEqual(vault.stat().st_mode & 0o777, 0o700)

    def test_uncertain_run_keeps_vault_sealed_until_operator_reconciles(self):
        with tempfile.TemporaryDirectory() as d:
            vault = Path(d) / "vault"
            vault.mkdir()
            token = vault / "token"
            token.write_text("synthetic-test-token")
            try:
                with self.assertRaisesRegex(RuntimeError, "unknown"):
                    with protect_operator({"boardTokenFile": str(token)}):
                        raise RuntimeError("unknown submission outcome")
                self.assertEqual(vault.stat().st_mode & 0o777, 0)
            finally:
                vault.chmod(0o700)


@unittest.skipUnless(sys.platform == "darwin", "native public-check Seatbelt qualification requires macOS")
class NativePublicCheckTests(unittest.TestCase):
    def test_public_smoke_imports_solution_but_cannot_read_oracle_fork_or_network(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            oracle = root / "not-public"
            oracle.write_text("oracle-canary")
            smoke = """import os, socket
from solution import solve
assert solve({}) == 7
try:
    open(%r).read()
    raise AssertionError('oracle readable')
except PermissionError:
    pass
try:
    os.fork()
    raise AssertionError('fork permitted')
except PermissionError:
    pass
with socket.socket() as connection:
    try:
        connection.connect(('127.0.0.1',3100))
        raise AssertionError('network permitted')
    except PermissionError:
        pass
print('public boundary verified')
""" % str(oracle)
            files = {"solution.py": "def solve(payload): return 7\n", "smoke_test.py": smoke}
            curation = root / "curation"
            curation.mkdir()
            (curation / "corpus.json").write_text(json.dumps({"cases": [{"id": "D01", "split": "dev", "objective": "public", "commonContext": {}, "startFiles": files}]}))
            output = root / "campaign"
            freeze(curation, output)
            workspace = output / "workspaces/D01-A"
            workspace.mkdir(parents=True)
            for name, content in files.items():
                (workspace / name).write_text(content)
            result = public_check(output, {}, "D01-A")
            self.assertEqual((result["exitCode"], result["stdout"], result["stderr"]), (0, "public boundary verified\n", ""))


if __name__ == "__main__":
    unittest.main()
