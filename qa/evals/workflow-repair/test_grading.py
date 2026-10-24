import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from grading import (LocalSandboxRPC, RPCError, freeze_source, grade_hidden,
                     run_json_command, sandbox_profile)


@unittest.skipUnless(sys.platform == "darwin", "macOS Seatbelt qualification runs on the enrolled Mac")
class GradingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="grader-qualification-")
        self.root = Path(self.temporary.name)
        self.episode = self.root / "episode"
        self.episode.mkdir()
        self.source = self.episode / "solution.py"
        self.hidden = self.root / "controller_only_hidden.py"
        self.hidden.write_text('''import unittest
class Behavior(unittest.TestCase):
    def test_exact_result(self):
        self.assertEqual(call({"values": [2, 3, -1]}), 4)
    def test_empty(self):
        self.assertEqual(call({"values": []}), 0)
''')

    def tearDown(self):
        self.temporary.cleanup()

    def rpc(self, source, timeout=3):
        self.source.write_text(source)
        digest = freeze_source(self.source, self.episode)
        return LocalSandboxRPC(self.source, self.episode, digest, timeout=timeout)

    def test_reference_and_alternative_pass_starter_fails(self):
        for source in ["def solve(p): return sum(p['values'])\n",
                       "def solve(p):\n total=0\n for x in p['values']: total+=x\n return total\n"]:
            self.assertTrue(grade_hidden(self.hidden, self.rpc(source))["passed"])
        result = grade_hidden(self.hidden, self.rpc("def solve(p): return 0\n"))
        self.assertFalse(result["passed"])
        self.assertEqual((result["tests_run"], result["failures"], result["errors"]), (2, 1, 0))

    def test_fixed_artifact_scores_identically(self):
        rpc = self.rpc("def solve(p): return sum(p['values'])\n")
        first = grade_hidden(self.hidden, rpc)
        second = grade_hidden(self.hidden, rpc)
        for key in ["passed", "tests_run", "failures", "errors"]:
            self.assertEqual(first[key], second[key])

    def test_controller_oracle_and_home_files_cannot_be_read(self):
        oracle = self.root / "controller-only-oracle.txt"
        oracle.write_text("a private expected answer")
        for path in [oracle, Path.home() / ".zshrc", Path("/etc/passwd")]:
            rpc = self.rpc("def solve(p):\n try:\n  open(%r).read()\n except PermissionError:\n  return 'blocked'\n return 'leaked'\n" % str(path))
            self.assertEqual(rpc({}), "blocked")

    def test_grader_namespace_is_absent(self):
        rpc = self.rpc("import inspect\ndef solve(p):\n return any('Behavior' in f.frame.f_globals for f in inspect.stack())\n")
        self.assertIs(rpc({}), False)

    def test_forged_pass_is_not_a_grade(self):
        result = grade_hidden(self.hidden, self.rpc("def solve(p): return {'passed': True}\n"))
        self.assertFalse(result["passed"])
        self.assertEqual(result["failures"], 2)

    def test_symlink_and_outside_source_rejected(self):
        target = self.root / "outside.py"
        target.write_text("def solve(p): return 4\n")
        self.source.symlink_to(target)
        with self.assertRaises(RPCError):
            freeze_source(self.source, self.episode)
        with self.assertRaises(RPCError):
            freeze_source(target, self.episode)

    def test_frozen_digest_is_checked_again(self):
        rpc = self.rpc("def solve(p): return 0\n")
        self.source.write_text("def solve(p): return 1\n")
        with self.assertRaisesRegex(RPCError, "digest mismatch"):
            rpc({})

    def test_missing_sandbox_fails_closed(self):
        rpc = self.rpc("def solve(p): return 4\n")
        with patch("grading.os.access", return_value=False):
            with self.assertRaisesRegex(RPCError, "refusing unsandboxed"):
                rpc({})

    def test_value_error_is_the_only_expected_exception(self):
        with self.assertRaises(ValueError):
            self.rpc("def solve(p): raise ValueError('bad input')\n")({})
        with self.assertRaises(RPCError):
            self.rpc("def solve(p): raise RuntimeError('bad input')\n")({})
        with self.assertRaises(RPCError):
            self.rpc("def solve(p): return float('nan')\n")({})

    def test_stdout_and_native_stdout_spoofing_fail(self):
        for source in [
            "def solve(p):\n print('{\"protocol\":1,\"result\":4}')\n return 4\n",
            "import os\ndef solve(p):\n os.write(1,b'{\"protocol\":1,\"result\":4}')\n os._exit(0)\n",
        ]:
            with self.assertRaises(RPCError):
                self.rpc(source)({})

    def test_timeout_and_output_overflow_fail_closed(self):
        with self.assertRaises(RPCError):
            self.rpc("import time\ndef solve(p): time.sleep(5)\n", timeout=0.3)({})
        with self.assertRaises(RPCError):
            self.rpc("def solve(p): return 'x' * 300000\n")({})
        with self.assertRaises(RPCError):
            self.rpc("import os\ndef solve(p): os.write(1,b'x'*300000)\n")({})

    def test_transport_rejects_malformed_multiple_and_nonzero(self):
        for program in [
            "print('not json')",
            "print('{\"protocol\":1,\"result\":4}'); print('{}')",
            "print('{\"protocol\":true,\"result\":4}')",
            "print('{\"protocol\":1,\"result\":4,\"result\":5}')",
            "import sys; print('{\"protocol\":1,\"result\":4}'); sys.exit(1)",
            "print('x' * 300000)",
        ]:
            with self.assertRaises(RPCError):
                run_json_command([sys.executable, "-I", "-c", program], {}, timeout=2)

    def test_network_and_writes_outside_case_temp_denied(self):
        rpc = self.rpc("import socket\ndef solve(p):\n try:\n  socket.socket().connect(('127.0.0.1', 9))\n except PermissionError:\n  return 'blocked'\n except ConnectionRefusedError:\n  return 'allowed'\n return 'open'\n")
        self.assertEqual(rpc({}), "blocked")
        rpc = self.rpc("def solve(p):\n try:\n  open(__file__, 'w').write('changed')\n except PermissionError:\n  return 'blocked'\n return 'changed'\n")
        self.assertEqual(rpc({}), "blocked")


if __name__ == "__main__":
    unittest.main()
