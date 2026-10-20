#!/usr/bin/python3
"""Bound only a foreground quota reader; never change the model guardian.

Keep the direct root unreaped through every group signal. Its reserved PID pins
the private PGID even if the shim exits before its config-reader descendants.
The private group leader stays alive through TERM so Darwin never requires a
signal to a zombie-only group. The configured reader must not detach children.
FD 3 is supervisor-only; Popen closes it in the configured reader.
"""
import json
import os
import signal
import subprocess
import sys
import time
import uuid

CLEANUP_SECONDS = 2.0


def cleanup(root, clock=time.monotonic, pause=time.sleep):
    deadline = clock() + CLEANUP_SECONDS
    def signal_group(sig):
        if os.getpgid(root.pid) != root.pid:
            return False
        try:
            os.killpg(root.pid, sig)
        except ProcessLookupError:
            pass
        return True
    # poll()/wait() before the final signal could release the PID for reuse.
    try:
        if not signal_group(signal.SIGTERM):
            return False
        pause(min(0.05, max(0, deadline - clock())))
        if clock() >= deadline or not signal_group(signal.SIGKILL):
            return False
        reaped = False
        while clock() < deadline:
            if not reaped:
                pid, status = os.waitpid(root.pid, os.WNOHANG)
                if pid:
                    reaped = True
                    root.returncode = os.WEXITSTATUS(status) if os.WIFEXITED(status) else -os.WTERMSIG(status)
            if reaped:
                # Only observe after reaping. A reused PGID causes refusal,
                # never another signal to an unrelated process.
                try:
                    os.killpg(root.pid, 0)
                except ProcessLookupError:
                    return True
                except PermissionError:
                    # Darwin also returns EPERM for a zombie-only group.
                    # After the final signal, keep observing within the bound.
                    pass
            pause(min(0.02, max(0, deadline - clock())))
    except (OSError, ChildProcessError):
        return False
    return False


def main(argv):
    stop = False
    owner, started = os.getppid(), time.monotonic()
    def request_stop(_signal, _frame):
        nonlocal stop
        stop = True
    def report(clean):
        try:
            os.write(3, (json.dumps({"cleanup": "terminated" if clean else "unknown"}) + "\n").encode())
        except OSError:
            pass
    try:
        if owner == 1 or not argv or argv[0] != "60000" or len(argv) < 2:
            report(False)
            return 3
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        environment = dict(os.environ)
        environment.pop("MORPHEUS_CD_AGENT_OWNER", None)
        environment["MORPHEUS_CD_QUOTA_READER_OWNER"] = uuid.uuid4().hex
        root = subprocess.Popen([sys.executable, __file__, "--group", *argv[1:]],
                                start_new_session=True, env=environment, close_fds=True)
        # Never poll/reap the root. A silent early exit remains fail-closed at
        # the active deadline, while its PID still protects descendant cleanup.
        while not stop and os.getppid() == owner and time.monotonic() - started < 60:
            time.sleep(0.02)
        clean = cleanup(root)
        report(clean)
        return 0 if clean and stop else 3
    except (OSError, ValueError):
        report(False)
        return 3


def group(command):
    # Keep a live, unreaped PGID owner through the final group signal. A reader
    # that exits early may still have live foreground config-reader children.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    supervisor = os.getppid()
    def reader_signals():
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.SIG_DFL)
    try:
        reader = subprocess.Popen(command, preexec_fn=reader_signals, close_fds=True) if supervisor != 1 else None
    except OSError:
        reader = None
    while supervisor != 1 and os.getppid() == supervisor:
        if reader is not None:
            reader.poll()
        time.sleep(0.05)
    # The live session leader reserves its own PGID even if the supervisor was
    # killed before cleanup. Never leave this private foreground group behind.
    os.killpg(0, signal.SIGKILL)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--group"]:
        group(sys.argv[2:])
    else:
        sys.exit(main(sys.argv[1:]))
