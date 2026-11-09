import hashlib
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Every external command setup can reach. Each fake logs its argv and succeeds, except
# `sudo` (no passwordless root here) and `launchctl print` of an unloaded job.
FAKES = ("brew", "git", "pnpm", "gh", "node", "xcodes", "xcode-select", "sudo", "launchctl", "morpheus",
         "docker", "colima", "tart", "claude", "codex", "curl", "unzip")


def executable(path, body):
    path.write_text("#!/bin/bash\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def snapshot(root):
    """Path → (mode, mtime, sha256) for everything under root, links included."""
    state = {}
    for path in sorted(Path(root).rglob("*")):
        info = path.lstat()
        digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() and not path.is_symlink() else None
        state[str(path.relative_to(root))] = (info.st_mode, info.st_mtime_ns, digest)
    return state


@unittest.skipUnless(sys.platform == "darwin", "worker setup is macOS-only")
class WorkerSetupTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.home = self.root / "home"
        self.code = self.home / "code"
        self.log = self.root / "commands.log"
        self.log.write_text("")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        for name in FAKES:
            body = f'echo "{name} $*" >> "{self.log}"\n'
            if name == "sudo":
                body += "exit 1\n"
            if name == "launchctl":
                body += f'[[ "$1" == print && -f "{self.root}/loaded" ]] && exit 0\n[[ "$1" == print ]] && exit 113\nexit 0\n'
            if name == "node":
                body += 'echo 22\n'
            executable(bin_dir / name, body)
        self.env = {"PATH": f"{bin_dir}:/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(self.home), "TMPDIR": str(self.root / "tmp")}
        (self.root / "tmp").mkdir()
        # What an operator's machine already has and setup must never touch.
        self.private = {
            ".local/share/factory/hosts.json": '{"schemaVersion": 1}',
            ".local/share/factory/config.json": '{"mode": "manual"}',
            ".claude/.credentials.json": '{"native": "login"}',
            ".codex/auth.json": '{"native": "login"}',
            "code/morpheus/.git/HEAD": "ref: refs/heads/main\n",
            "code/morpheus/README.md": "existing checkout\n",
            "code/example-app/.git/HEAD": "ref: refs/heads/main\n",
            "Library/LaunchAgents/com.morpheus-factory.host-updates.plist": "<plist/>",
        }
        for relative, text in self.private.items():
            path = self.home / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            os.chmod(path, 0o600)

    def run_setup(self, *args):
        return subprocess.run(["bash", str(ROOT / "worker/setup.sh"), "--code-root", str(self.code), *args],
                              env=self.env, capture_output=True, text=True)

    def run_stage(self, stage):
        env = {**self.env, "FACTORY_ROOT": str(ROOT), "WORKER_CODE_ROOT": str(self.code), "WORKER_CHECK_ONLY": "0",
               "MORPHEUS_CLEANUP_PYTHON": "/usr/bin/python3"}
        return subprocess.run(["bash", str(ROOT / f"worker/setup/{stage}.sh")], env=env, capture_output=True, text=True)

    def test_check_changes_nothing_and_runs_no_mutating_command(self):
        before = snapshot(self.home)
        package = snapshot(ROOT / "worker")
        result = self.run_setup("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Check complete; no changes made.", result.stdout)
        self.assertEqual(snapshot(self.home), before)
        self.assertEqual(snapshot(ROOT / "worker"), package)
        for line in self.log.read_text().splitlines():
            self.assertTrue(line.startswith(("xcode-select -p", "sudo -n -l")), line)

    def test_rerun_preserves_private_config_native_auth_checkouts_and_services(self):
        stages = ("source", "morpheus", "spotlight", "factory", "cleanup")
        for stage in stages:
            result = self.run_stage(stage)
            self.assertEqual(result.returncode, 0, f"{stage}: {result.stderr}")
        (self.root / "loaded").write_text("")  # launchd now reports the watchdog loaded
        first = {relative: (self.home / relative).stat().st_mtime_ns for relative in self.private}
        watchdog = self.home / "Library/LaunchAgents/com.morpheus-factory.development-cleanup.plist"
        installed = watchdog.read_bytes()
        self.log.write_text("")
        for stage in stages:
            result = self.run_stage(stage)
            self.assertEqual(result.returncode, 0, f"{stage}: {result.stderr}")
        for relative, text in self.private.items():
            self.assertEqual((self.home / relative).read_text(), text, relative)
            self.assertEqual((self.home / relative).stat().st_mtime_ns, first[relative], relative)
        self.assertEqual(watchdog.read_bytes(), installed)
        log = self.log.read_text()
        self.assertNotIn("launchctl bootout", log)  # an unchanged watchdog is left running
        self.assertNotIn("launchctl bootstrap", log)
        self.assertNotIn("git clone", log)  # the existing checkout is kept
        self.assertNotIn("morpheus self install", log)  # the CLI already on PATH is kept

    def test_setup_never_reaches_heavy_capabilities(self):
        result = self.run_setup("--check")
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text()
        for heavy in ("docker", "colima", "tart", "claude", "codex", "brew install", "xcodes install"):
            self.assertNotIn(heavy, log)
        setup = "".join(path.read_text() for path in sorted((ROOT / "worker/setup").glob("*.sh")))
        for capability in ("setup-sub2api", "docker", "colima", "install_updates.py --host", "runner.sh install"):
            self.assertNotIn(capability, setup)


if __name__ == "__main__":
    unittest.main()
