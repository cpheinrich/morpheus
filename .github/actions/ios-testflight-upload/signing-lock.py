"""Hold the runner account's signing lease across exec and shell EXIT cleanup."""
import fcntl
import math
import os
from pathlib import Path
import pwd
import stat
import sys
import time


def account_lock_path():
    # HOME/TMPDIR/RUNNER_TEMP can differ between runners under the same UID.
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    return home / 'Library' / 'Caches' / 'morpheus' / 'testflight-signing.lock'


def run_locked(command, lock_path, timeout=600):
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError('Signing lock timeout must be positive and finite')
    lock_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise RuntimeError('Signing lock must be a regular file owned by this account')
        deadline = time.monotonic() + timeout
        waiting = False
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise TimeoutError('Timed out waiting for macOS signing lock; another release is still active')
                if not waiting:
                    print('Waiting for this macOS account\'s active TestFlight release...', flush=True)
                    waiting = True
                time.sleep(min(.1, max(0, deadline - time.monotonic())))
        # The shell and its children own the descriptor, including EXIT cleanup.
        # No supervisor can die early and release a still-running signer's lease.
        os.set_inheritable(descriptor, True)
        os.execv(command[0], command)
    finally:
        os.close(descriptor)
    # Never unlink the file: waiters must always lock the same inode. The kernel
    # releases the lease when the last inheriting process closes its descriptor.


if __name__ == '__main__':
    try:
        value = os.environ.get('SIGNING_LOCK_TIMEOUT_SECONDS', '600')
        if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= 3600:
            raise ValueError('signing-lock-timeout-seconds must be an integer from 1 to 3600')
        if len(sys.argv) < 2:
            raise ValueError('A signing command is required')
        run_locked(sys.argv[1:], account_lock_path(), int(value))
    except (OSError, ValueError, RuntimeError) as error:
        print(f'Signing lock: {error}', file=sys.stderr)
        sys.exit(1)
