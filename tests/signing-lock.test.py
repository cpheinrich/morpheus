"""Native process tests: no Apple credential, keychain, or upload is used."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / '.github/actions/ios-testflight-upload/signing-lock.py'
spec = importlib.util.spec_from_file_location('signing_lock', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SigningLockTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='morpheus signing ')
        self.root = Path(self.directory.name)
        self.lock = self.root / 'signing.lock'
        self.processes = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            process.communicate(timeout=5)
        self.directory.cleanup()

    def start(self, shell, timeout=3):
        code = (
            'import importlib.util,pathlib;'
            f's=importlib.util.spec_from_file_location("lock",{str(SCRIPT)!r});'
            'm=importlib.util.module_from_spec(s);s.loader.exec_module(m);'
            f'm.run_locked(["/bin/bash","-c",{shell!r}],pathlib.Path({str(self.lock)!r}),{timeout!r})'
        )
        process = subprocess.Popen([sys.executable, '-c', code], cwd=self.root,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                   start_new_session=True)
        self.processes.append(process)
        return process

    def wait_for(self, path):
        deadline = time.monotonic() + 5
        while not (self.root / path).exists():
            if time.monotonic() > deadline:
                self.fail(f'timed out waiting for {path}')
            time.sleep(.01)

    def test_overlapping_signers_restore_state_before_the_next_snapshot(self):
        (self.root / 'keychains').write_text('login')
        script = '''set -eu
original=$(cat keychains)
test "$original" = login
echo "$LANE enter" >> events
echo "$LANE" > keychains
touch "$LANE-entered"
cleanup() { sleep .1; printf '%s' "$original" > keychains; echo "$LANE cleanup" >> events; }
trap cleanup EXIT
while [ ! -f "$LANE-release" ]; do sleep .02; done
'''
        a = self.start('LANE=a; ' + script)
        self.wait_for('a-entered')
        b = self.start('LANE=b; ' + script)
        time.sleep(.15)
        self.assertFalse((self.root / 'b-entered').exists())
        self.assertIsNone(b.poll())
        (self.root / 'a-release').touch()
        self.assertEqual(a.wait(timeout=5), 0)
        self.wait_for('b-entered')
        (self.root / 'b-release').touch()
        self.assertEqual(b.wait(timeout=5), 0)
        self.assertEqual((self.root / 'events').read_text().splitlines(),
                         ['a enter', 'a cleanup', 'b enter', 'b cleanup'])
        self.assertEqual((self.root / 'keychains').read_text(), 'login')

    def test_timeout_does_not_enter_or_remove_the_active_lock(self):
        a = self.start('touch entered; while [ ! -f release ]; do sleep .02; done')
        self.wait_for('entered')
        inode = self.lock.stat().st_ino
        b = self.start('touch wrongly-entered', timeout=.1)
        _, stderr = b.communicate(timeout=5)
        self.assertNotEqual(b.returncode, 0)
        self.assertIn('Timed out waiting for macOS signing lock', stderr)
        self.assertFalse((self.root / 'wrongly-entered').exists())
        self.assertEqual(self.lock.stat().st_ino, inode)
        self.assertIsNone(a.poll())
        (self.root / 'release').touch()
        self.assertEqual(a.wait(timeout=5), 0)
        self.assertEqual(self.start('exit 0').wait(timeout=5), 0)
        self.assertEqual(self.lock.stat().st_ino, inode)

    def test_failed_signer_releases_after_exit_cleanup(self):
        a = self.start("trap 'echo cleaned > cleaned' EXIT; exit 7")
        self.assertEqual(a.wait(timeout=5), 7)
        self.assertEqual(self.start('test -f cleaned').wait(timeout=5), 0)

    def test_descendant_holds_lock_after_parent_is_killed(self):
        a = self.start('sleep .8 & touch entered; wait')
        self.wait_for('entered')
        a.kill()
        a.wait(timeout=5)
        b = self.start('touch wrongly-entered', timeout=.1)
        self.assertNotEqual(b.wait(timeout=5), 0)
        self.assertFalse((self.root / 'wrongly-entered').exists())
        self.assertEqual(self.start('touch recovered').wait(timeout=5), 0)
        self.assertTrue((self.root / 'recovered').exists())

    def test_cancelled_waiter_does_not_release_the_owner(self):
        a = self.start('touch entered; while [ ! -f release ]; do sleep .02; done')
        self.wait_for('entered')
        b = self.start('touch wrongly-entered')
        b.terminate()
        b.wait(timeout=5)
        self.assertNotEqual(self.start('touch wrongly-entered', timeout=.1).wait(timeout=5), 0)
        self.assertFalse((self.root / 'wrongly-entered').exists())
        (self.root / 'release').touch()
        self.assertEqual(a.wait(timeout=5), 0)

    def test_account_path_ignores_per_job_home_and_temp_overrides(self):
        before = module.account_lock_path()
        from unittest.mock import patch
        with patch.dict(os.environ, {'HOME': str(self.root), 'RUNNER_TEMP': str(self.root)}):
            self.assertEqual(module.account_lock_path(), before)

    def test_owner_cancellation_keeps_the_lock_through_cleanup(self):
        a = self.start("trap 'touch cleaning; sleep .4; touch cleaned; exit 143' TERM; "
                       "touch entered; while true; do sleep .02; done")
        self.wait_for('entered')
        a.terminate()
        self.wait_for('cleaning')
        self.assertNotEqual(self.start('touch wrongly-entered', timeout=.1).wait(timeout=5), 0)
        self.assertFalse((self.root / 'wrongly-entered').exists())
        self.assertEqual(a.wait(timeout=5), 143)
        self.assertEqual(self.start('test -f cleaned').wait(timeout=5), 0)

    def test_invalid_timeout_fails_before_starting_the_signer(self):
        for timeout in [0, -1, float('inf'), float('nan')]:
            with self.assertRaises(ValueError):
                module.run_locked(['/usr/bin/false'], self.lock, timeout)
        self.assertFalse(self.lock.exists())
        for timeout in ['0', '-1', '1.5', '3601', 'invalid']:
            result = subprocess.run([sys.executable, str(SCRIPT), '/usr/bin/true'],
                                    env=os.environ | {'SIGNING_LOCK_TIMEOUT_SECONDS': timeout},
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('integer from 1 to 3600', result.stderr)

    def test_symlink_lock_is_refused(self):
        target = self.root / 'target'
        target.write_text('unchanged')
        self.lock.symlink_to(target)
        self.assertNotEqual(self.start('touch wrongly-entered').wait(timeout=5), 0)
        self.assertEqual(target.read_text(), 'unchanged')
        self.assertFalse((self.root / 'wrongly-entered').exists())


if __name__ == '__main__':
    unittest.main()
