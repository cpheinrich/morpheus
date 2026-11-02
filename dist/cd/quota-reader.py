#!/usr/bin/python3
"""Bound only a foreground quota reader; never change the model guardian.

Keep the direct root unreaped through every group signal. Its reserved PID pins
the private PGID even if the shim exits before its config-reader descendants.
The private group leader stays alive through TERM so Darwin never requires a
signal to a zombie-only group. The configured reader must not detach children.
FD 3 is supervisor-only; the group has a separate bounded status pipe that is
also closed in the configured reader. Neither reader text nor paths enter it.
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
    def report(status):
        try:
            os.write(3, (json.dumps(status) + "\n").encode())
        except OSError:
            pass
    status_read = status_write = None
    try:
        if owner == 1 or not argv or argv[0] != "60000" or len(argv) < 2:
            report({"cleanup": "unknown"})
            return 3
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        environment = dict(os.environ)
        environment.pop("MORPHEUS_CD_AGENT_OWNER", None)
        environment["MORPHEUS_CD_QUOTA_READER_OWNER"] = uuid.uuid4().hex
        status_read, status_write = os.pipe()
        os.set_blocking(status_read, False)
        root = subprocess.Popen([sys.executable, __file__, "--group", str(status_write), *argv[1:]],
                                start_new_session=True, env=environment, close_fds=True,
                                pass_fds=(status_write,))
        os.close(status_write)
        status_write = None
        # Never poll/reap the root. Its live group leader reports only a fixed
        # failure status, while its PID still protects descendant cleanup.
        pending = b""
        while not stop and os.getppid() == owner and time.monotonic() - started < 60:
            try:
                chunk = os.read(status_read, 256)
                if not chunk:
                    report({"reader": "status-unavailable"})
                    stop = True
                    break
                pending += chunk
            except BlockingIOError:
                pass
            if b"\n" in pending or len(pending) > 128:
                status = None
                try:
                    value = json.loads(pending)
                    if (isinstance(value, dict) and len(value) == 2
                            and value.get("reader") == "spawn-failed"
                            and type(value.get("errno")) is int and 0 <= value["errno"] <= 4095):
                        status = value
                    elif (isinstance(value, dict) and len(value) == 2
                            and value.get("reader") == "exited"
                            and type(value.get("code")) is int and -255 <= value["code"] <= 255):
                        status = value
                except (ValueError, UnicodeError):
                    pass
                report(status if status is not None else {"reader": "status-unavailable"})
                stop = True
                break
            time.sleep(0.02)
        clean = cleanup(root)
        report({"cleanup": "terminated" if clean else "unknown"})
        return 0 if clean and stop else 3
    except (OSError, ValueError):
        report({"cleanup": "unknown"})
        return 3
    finally:
        for descriptor in (status_read, status_write):
            if descriptor is not None:
                os.close(descriptor)


def group(status_fd, command):
    # Keep a live, unreaped PGID owner through the final group signal. A reader
    # that exits early may still have live foreground config-reader children.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    supervisor = os.getppid()
    reported = False
    def report(status):
        nonlocal reported
        if not reported:
            try:
                os.write(status_fd, (json.dumps(status) + "\n").encode())
            except OSError:
                # A dead supervisor must not release the live PGID owner early.
                pass
            reported = True
    def reader_signals():
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        signal.signal(signal.SIGINT, signal.SIG_DFL)
    try:
        reader = subprocess.Popen(command, preexec_fn=reader_signals, close_fds=True) if supervisor != 1 else None
    except OSError as error:
        report({"reader": "spawn-failed", "errno": error.errno if type(error.errno) is int else 0})
        reader = None
    while supervisor != 1 and os.getppid() == supervisor:
        if reader is not None:
            code = reader.poll()
            if code is not None:
                report({"reader": "exited", "code": code})
        time.sleep(0.05)
    # The live session leader reserves its own PGID even if the supervisor was
    # killed before cleanup. Never leave this private foreground group behind.
    os.killpg(0, signal.SIGKILL)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--group"]:
        group(int(sys.argv[2]), sys.argv[3:])
    else:
        sys.exit(main(sys.argv[1:]))
