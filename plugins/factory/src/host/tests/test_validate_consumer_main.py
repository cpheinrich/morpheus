import importlib.util
import io
import os
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "worker/validate_consumer_main.py"
spec = importlib.util.spec_from_file_location("validate_consumer_main", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ValidateConsumerMainTests(unittest.TestCase):
    def test_dirty_primary_checkout_is_untouched_and_scratch_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "example-app"
            repo.mkdir()
            developer = root / "Xcode.app/Contents/Developer"
            (developer / "usr/bin").mkdir(parents=True)
            (developer / "usr/bin/xcodebuild").write_text("")
            script = repo / "apps/ios/scripts/dev.sh"
            script.parent.mkdir(parents=True)
            script.write_text('#!/bin/sh\ntest "$(cat marker)" = main\n')
            script.chmod(0o755)
            marker = repo / "apps/ios/marker"
            marker.write_text("main\n")

            def git(*args):
                return subprocess.run(["git", "-C", str(repo), *args], check=True,
                                      capture_output=True, text=True).stdout.strip()

            git("init", "-q")
            git("config", "user.email", "test@example.invalid")
            git("config", "user.name", "Test")
            git("add", "apps/ios")
            git("commit", "-qm", "base")
            git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
            expected = git("rev-parse", "HEAD")
            marker.write_text("dirty\n")
            with patch.dict(os.environ, {"DEVELOPER_DIR": str(developer)}):
                self.assertEqual(validator.validate(repo), expected)
            self.assertEqual(marker.read_text(), "dirty\n")
            self.assertEqual(git("worktree", "list", "--porcelain").count("worktree "), 1)

            script.write_text("#!/bin/sh\nexit 7\n")
            git("add", "apps/ios/scripts/dev.sh")
            git("commit", "-qm", "failing main")
            git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"))
            with patch.dict(os.environ, {"DEVELOPER_DIR": str(developer)}):
                with self.assertRaises(subprocess.CalledProcessError):
                    validator.validate(repo)
            self.assertEqual(marker.read_text(), "dirty\n")
            self.assertEqual(git("worktree", "list", "--porcelain").count("worktree "), 1)


    def test_device_gate_runs_signed_device_build_for_that_udid(self):
        udid = "00000000-000000000000000E"
        with tempfile.TemporaryDirectory() as directory:
            developer = Path(directory) / "Xcode.app/Contents/Developer"
            (developer / "usr/bin").mkdir(parents=True)
            (developer / "usr/bin/xcodebuild").write_text("")
            builds = []

            def git(argv, **kwargs):
                if argv[3:5] == ["worktree", "add"]:
                    script = Path(argv[6]) / "apps/ios/scripts/dev.sh"
                    script.parent.mkdir(parents=True)
                    script.write_text("")
                return "a" * 40

            def build(argv, **kwargs):
                builds.append((argv, kwargs["cwd"]))

            with patch.dict(os.environ, {"DEVELOPER_DIR": str(developer)}), \
                 patch.object(validator, "command", side_effect=git) as commands, \
                 patch.object(validator.subprocess, "run", side_effect=build):
                self.assertEqual(validator.validate(Path(directory), udid), "a" * 40)
                self.assertEqual(validator.validate(Path(directory)), "a" * 40)
            self.assertEqual([argv[1:] for argv, _ in builds], [["build-device-gate", udid], ["build"]])
            self.assertTrue(all(argv[0].endswith("/consumer/apps/ios/scripts/dev.sh") and cwd.name == "ios" for argv, cwd in builds))
            removed = [call.args[0][3:5] for call in commands.call_args_list if call.args[0][3:5] == ["worktree", "remove"]]
            self.assertEqual(len(removed), 2)

    def test_device_gate_rejects_a_malformed_udid(self):
        for bad in ("00000000-000000000000000", "../../etc", "00000000-000000000000000E; rm"):
            with self.assertRaisesRegex(ValueError, "hardware UDID"):
                validator.validate(Path("/nonexistent"), bad)
            with patch.object(validator.sys, "argv", ["validate_consumer_main.py", "--repo", "/x", "--device-gate", bad]), \
                 patch.object(validator, "validate") as validate, redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as exit:
                    validator.main()
            self.assertEqual(exit.exception.code, 2)
            validate.assert_not_called()

    def test_main_passes_device_gate_through(self):
        udid = "00000000-000000000000000F"
        with patch.object(validator.sys, "argv", ["validate_consumer_main.py", "--repo", "/x", "--device-gate", udid]), \
             patch.object(validator, "validate", return_value="b" * 40) as validate, redirect_stdout(io.StringIO()):
            validator.main()
        validate.assert_called_once_with(Path("/x"), udid, "apps/ios/scripts/dev.sh")

    def test_build_script_is_configurable_but_stays_inside_the_checkout(self):
        with patch.object(validator.sys, "argv", ["validate_consumer_main.py", "--repo", "/x", "--script", "ios/build.sh"]), \
             patch.object(validator, "validate", return_value="b" * 40) as validate, redirect_stdout(io.StringIO()):
            validator.main()
        validate.assert_called_once_with(Path("/x"), "", "ios/build.sh")
        with tempfile.TemporaryDirectory() as directory:
            developer = Path(directory) / "Xcode.app/Contents/Developer"
            (developer / "usr/bin").mkdir(parents=True)
            (developer / "usr/bin/xcodebuild").write_text("")
            with patch.dict(os.environ, {"DEVELOPER_DIR": str(developer)}):
                for bad in ("/bin/sh", "../escape.sh"):
                    with self.assertRaisesRegex(ValueError, "inside the consumer"):
                        validator.validate(Path(directory), "", bad)

if __name__ == "__main__":
    unittest.main()
