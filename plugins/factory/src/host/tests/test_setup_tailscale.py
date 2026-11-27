"""Exercise host enrollment with fixture commands and no network, real sudo or Homebrew."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/setup-tailscale.sh"


def executable(path, body):
    path.write_text("#!/bin/bash\nset -eu\n" + body)
    path.chmod(0o700)


class SetupTailscaleTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.state = self.root / "state"
        self.log = self.root / "log"
        self.log.touch()
        self.state.write_text("enroll")
        self.env = {
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "HOME": str(self.root),
            "FIXTURE_ROOT": str(self.root),
        }
        self.setup = self.root / SCRIPT.name
        original = SCRIPT.read_text()
        self.setup.write_text(original.replace(
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            str(self.root / "missing-app"),
        ))
        executable(self.bin / "uname", "printf 'Darwin\\n'\n")
        executable(self.bin / "sudo", 'printf "sudo %s\\n" "$*" >> "$FIXTURE_ROOT/log"\nexec "$@"\n')
        executable(self.bin / "brew", '''
case "$*" in
  "install --formula tailscale")
    cp "$FIXTURE_ROOT/tailscale-fixture" "$FIXTURE_ROOT/bin/tailscale" ;;
  "list --formula tailscale")
    test -x "$FIXTURE_ROOT/bin/tailscale" ;;
  "--prefix")
    printf '%s\\n' "$FIXTURE_ROOT"; exit 0 ;;
  "services start tailscale")
    touch "$FIXTURE_ROOT/daemon" ;;
  *) exit 81 ;;
esac
printf 'brew %s\\n' "$*" >> "$FIXTURE_ROOT/log"
''')
        executable(self.root / "tailscale-fixture", '''
case "$1" in
  status)
    test -f "$FIXTURE_ROOT/daemon"
    case "$(cat "$FIXTURE_ROOT/state")" in
      enroll) printf '%s\\n' '{"BackendState":"NeedsLogin","HaveNodeKey":false,"Self":{"ID":""},"CurrentTailnet":null}' ;;
      expiring) printf '%s\\n' '{"BackendState":"Running","Self":{"ID":"nFixture","KeyExpiry":"2030-01-01T00:00:00Z"}}' ;;
      blocked) printf '%s\\n' '{"BackendState":"NeedsLogin","HaveNodeKey":true,"Self":{"ID":""},"CurrentTailnet":null}' ;;
      tagged) printf '%s\\n' '{"BackendState":"Running","Self":{"ID":"nFixture","Tags":["tag:ci"]}}' ;;
      connected) printf '%s\\n' '{"BackendState":"Running","Self":{"ID":"nFixture","KeyExpiry":null}}' ;;
      *) exit 82 ;;
    esac ;;
  up)
    printf 'tailscale %s\\n' "$*" >> "$FIXTURE_ROOT/log"
    printf '%s\\n' "${FIXTURE_AFTER:-tagged}" > "$FIXTURE_ROOT/state" ;;
  *) exit 83 ;;
esac
''')

    def install_fixture(self, state):
        self.state.write_text(state)
        (self.root / "daemon").touch()
        (self.bin / "tailscale").symlink_to(self.root / "tailscale-fixture")

    def run_setup(self, *args, require_tag=True, **env):
        tag_args = ["--tag", "tag:ci"] if require_tag else []
        return subprocess.run(
            ["/bin/bash", str(self.setup), *tag_args, *args],
            env={**self.env, **env}, capture_output=True, text=True, timeout=15,
        )

    def test_fresh_install_starts_service_and_verifies_tagged_enrollment(self):
        key_file = self.root / "enrollment.key"
        key_file.write_text("synthetic-one-time-value")
        result = self.run_setup(TAILSCALE_AUTH_KEY_FILE=str(key_file))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Tailscale enrolled with device key expiry disabled.", result.stdout)
        commands = self.log.read_text()
        self.assertIn("brew install --formula tailscale", commands)
        self.assertIn("brew services start tailscale", commands)
        self.assertIn(f"tailscale up --advertise-tags=tag:ci --timeout=5m --auth-key=file:{key_file}", commands)
        self.assertNotIn("synthetic-one-time-value", commands + result.stdout + result.stderr)
        self.log.write_text("")
        self.assertEqual(self.run_setup().returncode, 0)
        self.assertEqual(self.log.read_text(), "")

    def test_check_does_not_install_or_enroll(self):
        self.assertEqual(self.run_setup("--check").returncode, 1)
        self.install_fixture("enroll")
        self.assertEqual(self.run_setup("--check").returncode, 1)
        self.assertEqual(self.log.read_text(), "")

    def test_existing_connections_keep_their_identity(self):
        self.install_fixture("connected")
        result = self.run_setup("--check", require_tag=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("device key expiry disabled", result.stdout)
        mismatch = self.run_setup()
        self.assertEqual(mismatch.returncode, 1)
        self.assertIn("existing Tailscale device does not have the requested tag", mismatch.stderr)
        self.state.write_text("expiring")
        refusal = self.run_setup()
        self.assertEqual(refusal.returncode, 1)
        self.assertIn("existing Tailscale device has key expiry enabled", refusal.stderr)
        self.state.write_text("blocked")
        retained = self.run_setup(TAILSCALE_AUTH_KEY_FILE=str(self.root / "unreadable-key"))
        self.assertEqual(retained.returncode, 1)
        self.assertIn("Could not verify Tailscale enrollment", retained.stderr)
        self.assertEqual(self.log.read_text(), "")

    def test_enrollment_requires_both_requested_tag_and_disabled_expiry(self):
        self.install_fixture("enroll")
        for state in ("expiring", "connected"):
            self.state.write_text("enroll")
            with self.subTest(state=state):
                result = self.run_setup(FIXTURE_AFTER=state)
                self.assertEqual(result.returncode, 1)
                self.assertIn("did not confirm the requested tag and disabled key expiry", result.stderr)
                log = self.log.read_text()
                self.assertEqual(self.run_setup().returncode, 1)
                self.assertEqual(self.run_setup("--check").returncode, 1)
                self.assertEqual(self.log.read_text(), log)


if __name__ == "__main__":
    unittest.main()
