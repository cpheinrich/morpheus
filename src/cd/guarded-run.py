#!/usr/bin/python3
"""Bound a worker independently of its controller, retaining orphan ownership."""
import os
import re
import signal
import subprocess
import sys
import time
import uuid

limit_ms, *command = sys.argv[1:]
owner = os.getppid()
if owner == 1:
    sys.exit(125)
stop_requested = False
# Nonsecret per-invocation ownership survives reparenting and process-group changes.
# Only the worker receives it; the controller, guardian and other host jobs do not.
marker = "MORPHEUS_CD_AGENT_OWNER=" + uuid.uuid4().hex
matcher = re.compile(r"(?:^|\s)" + re.escape(marker) + r"(?:\s|$)")

def stop_signal(_signum, _frame):
    global stop_requested
    stop_requested = True

signal.signal(signal.SIGTERM, stop_signal)
signal.signal(signal.SIGINT, stop_signal)

# BSD option letters must be bundled ahead of the standard -o list: macOS accepts
# "eww -axo", but Linux procps rejects a leading "-a" bundle with "must set personality
# to get -x option". This spelling is portable, and "e" still appends the environment.
CENSUS = ["/bin/ps", "axeww", "-o", "pid=,lstart=,command="]

def owned_processes():
    # ps reads process environments internally. Never log or persist its raw output:
    # it may contain credentials. Retain only matching PID and birth identity.
    # Under load (two full simulator suites) a census can take seconds; a timeout
    # here once turned a budget stop into a controller crash (2026-09-30), so
    # retry with a longer limit and fall back to the previous census.
    rows = None
    for attempt, limit in enumerate((5, 10, 20)):
        try:
            rows = subprocess.check_output(CENSUS, text=True, timeout=limit)
            break
        except subprocess.TimeoutExpired:
            if attempt == 2:
                print("guarded-run: process census timed out three times; using the last census", file=sys.stderr)
                return dict(owned_processes.last)
    result = {}
    for line in rows.splitlines():
        fields = line.split(None, 6)
        if len(fields) == 7 and matcher.search(fields[6]):
            result[int(fields[0])] = " ".join(fields[1:6])
    owned_processes.last = result
    return result
owned_processes.last = {}

def send(owned, sig):
    current = owned_processes()
    for pid, birth in owned.items():
        if current.get(pid) == birth:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass

def cleanup():
    # Stop parents before taking another census, preventing new commands during
    # cleanup. Orphans still carry their unique ownership even if born just before
    # the root exited, which periodic parent-PID snapshots cannot establish.
    for _ in range(4):
        owned = owned_processes()
        if not owned:
            return
        send(owned, signal.SIGSTOP)
        found = owned_processes()
        if found == owned:
            break
    owned = owned_processes()
    send(owned, signal.SIGTERM)
    send(owned, signal.SIGCONT)
    time.sleep(0.5)
    send(owned_processes(), signal.SIGKILL)

key, value = marker.split("=", 1)
worker = subprocess.Popen(command, start_new_session=True, env={**os.environ, key: value})
deadline = time.monotonic() + int(limit_ms) / 1000
code = 125
try:
    while worker.poll() is None:
        if stop_requested or os.getppid() != owner or time.monotonic() >= deadline:
            code = 124
            break
        time.sleep(0.1)
    else:
        code = worker.returncode
finally:
    try:
        cleanup()
    finally:
        # Popen still owns an unreaped live root even if the census fails.
        if worker.poll() is None:
            os.killpg(worker.pid, signal.SIGKILL)
        worker.wait()
sys.exit(code)
