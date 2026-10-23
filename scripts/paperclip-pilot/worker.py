#!/usr/bin/python3
"""Paperclip codex_local command wrapper: relay one turn to the agent's bound host.

Paperclip runs `<launcher> exec --json ... -` with the prompt on stdin and its
PAPERCLIP_* variables in the environment. The launcher (written by pilot.mjs) is
`worker.py --inventory INVENTORY "$@"`. This wrapper:

1. resolves PAPERCLIP_AGENT_ID to exactly one host in the operator-owned inventory
   (a fixed, immutable agent <-> host <-> workspace binding; never a fallback host);
2. takes an atomic account reservation under a controller-side flock, so workers
   that share one subscription account are admitted one at a time with in-flight
   runs counted; a reservation whose run cannot be shown finished stays held;
3. runs supervisor.py on the host (locally, or over SSH with a loopback reverse
   tunnel to the controller) and writes the envelope on its stdin, which stays open
   for the whole run - EOF there is how the host learns the controller is gone;
4. passes the host's stdout through byte for byte, so Paperclip parses Codex JSONL.

Nothing from this process's environment reaches the host except PAPERCLIP_* values,
and those only on stdin: never argv, never a log line. CODEX_HOME, provider API keys
and session files stay where they are. The host uses its own existing Codex login.

`worker.py --inventory INVENTORY reconcile` re-checks held reservations.
"""
import fcntl
import hashlib
import json
import os
import re
import shlex
import signal
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

INVENTORY_SCHEMA = "morpheus-paperclip-inventory/1"
ENVELOPE_SCHEMA = "morpheus-paperclip-envelope/1"
RECEIPT_PREFIX = "MORPHEUS_PAPERCLIP_RECEIPT "
PROMPT_LIMIT = 2 * 1024 * 1024
REFUSED, CONFIG = 75, 78
STOP_GRACE_SEC = 12
SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ExitOnForwardFailure=yes",
               "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=15"]
ENV_NAME = re.compile(r"^PAPERCLIP_[A-Z0-9_]{1,64}$")


def log(message):
    sys.stderr.write("paperclip-worker: %s\n" % message)
    sys.stderr.flush()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_inventory(path):
    info = os.stat(path)
    if info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise ValueError("inventory must be owned by this user and not group/world writable")
    with open(path) as handle:
        inventory = json.load(handle)
    if inventory.get("schema") != INVENTORY_SCHEMA:
        raise ValueError("unknown inventory schema")
    return inventory


def host_for_agent(inventory, agent_id):
    matches = [(name, host) for name, host in inventory.get("hosts", {}).items() if agent_id and host.get("agentId") == agent_id]
    if len(matches) != 1:
        raise ValueError("agent is not bound to exactly one enrolled host")
    return matches[0]


def binding_digest(name, host):
    binding = [name, host.get("transport"), host.get("sshTarget"), host.get("accountId"), host.get("controllerCwd"),
               host.get("hostConfig", {}).get("workspace"), host.get("supervisorPath"), host.get("hostConfigPath")]
    return hashlib.sha256(json.dumps(binding, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def birth_of(pid):
    try:
        out = subprocess.check_output(["/bin/ps", "-o", "lstart=", "-p", str(pid)], text=True, timeout=10, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    return " ".join(out.split()) or None


def supervisor_command(inventory, host_name, host, *tail):
    remote = [host.get("python", "/usr/bin/python3"), host["supervisorPath"], "--config", host["hostConfigPath"]] + list(tail)
    if host.get("transport") == "local":
        return remote
    if host.get("transport") != "ssh" or not re.match(r"^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$", host.get("sshTarget", "")):
        raise ValueError("host %s needs transport local, or ssh with sshTarget user@host" % host_name)
    command = ["ssh"] + SSH_OPTIONS
    if tail and tail[0] == "run":
        controller = inventory["controller"]
        # Loopback on both ends; a fixed per-host port. Anyone who can use this
        # remote account reaches the local-trusted board while a run is live.
        command += ["-R", "127.0.0.1:%d:127.0.0.1:%d" % (int(host["tunnelPort"]), int(controller["port"]))]
    # ssh joins its trailing words into one remote shell command; quote each part.
    return command + [host["sshTarget"], " ".join(shlex.quote(part) for part in remote)]


class Ledger:
    """Account reservations under a controller-side kernel lock."""

    def __init__(self, inventory, account):
        directory = os.path.join(inventory["stateDir"], "accounts")
        os.makedirs(directory, mode=0o700, exist_ok=True)
        self.path = os.path.join(directory, account + ".json")
        self.lock_path = os.path.join(directory, account + ".lock")

    def __enter__(self):
        self.fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        fcntl.flock(self.fd, fcntl.LOCK_EX)
        try:
            with open(self.path) as handle:
                self.entries = json.load(handle)
        except FileNotFoundError:
            self.entries = []
        return self

    def save(self):
        tmp = self.path + ".tmp"
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as handle:
            json.dump(self.entries, handle, indent=2)
        os.replace(tmp, self.path)

    def __exit__(self, *_):
        os.close(self.fd)


def reconcile_entry(inventory, entry):
    """A dead wrapper proves nothing about the host; ask the host's supervisor."""
    if entry.get("wrapperPid") and birth_of(entry["wrapperPid"]) == entry.get("wrapperBirth"):
        return "active"
    host = inventory["hosts"].get(entry.get("hostName"))
    if not host:
        return "unknown"
    try:
        result = subprocess.run(supervisor_command(inventory, entry["hostName"], host, "reconcile", entry["runUuid"]),
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=45)
        return json.loads(result.stdout.strip().splitlines()[-1]).get("state", "unknown")
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return "unknown"


def reserve(inventory, host_name, host, run_uuid, paperclip_run_id):
    account = host["accountId"]
    limit = int(inventory.get("accounts", {}).get(account, {}).get("maxInFlight", 1))
    with Ledger(inventory, account) as ledger:
        kept = []
        for entry in ledger.entries:
            state = reconcile_entry(inventory, entry)
            if state != "terminated":
                entry["lastCheck"] = {"state": state, "at": now_iso()}
                kept.append(entry)
        ledger.entries = kept
        if len(kept) >= limit:
            ledger.save()
            return None
        kept.append({"runUuid": run_uuid, "hostName": host_name, "paperclipRunId": paperclip_run_id,
                     "wrapperPid": os.getpid(), "wrapperBirth": birth_of(os.getpid()), "reservedAt": now_iso()})
        ledger.save()
        return len(kept)


def release(inventory, account, run_uuid):
    with Ledger(inventory, account) as ledger:
        ledger.entries = [e for e in ledger.entries if e.get("runUuid") != run_uuid]
        ledger.save()


def build_envelope(inventory, host_name, host, args, prompt, run_uuid, in_flight, environ):
    env = {k: v for k, v in environ.items() if ENV_NAME.match(k)}
    if host.get("transport") == "ssh":
        env["PAPERCLIP_API_URL"] = "http://127.0.0.1:%d" % int(host["tunnelPort"])
    for source, target in host.get("promptPathMap", []):
        # Only exact, operator-declared prefixes (instructions and workspace roots).
        prompt = prompt.replace(source, target)
    return {"schema": ENVELOPE_SCHEMA, "runUuid": run_uuid, "hostId": host_name, "agentId": host["agentId"],
            "bindingSha256": environ["PAPERCLIP_HOST_BINDING_SHA256"],
            "args": args, "env": env, "prompt": prompt, "inFlight": in_flight}


def relay(inventory, host_name, host, args):
    prompt = sys.stdin.buffer.read(PROMPT_LIMIT + 1)
    if len(prompt) > PROMPT_LIMIT:
        log("prompt exceeds %d bytes; refusing" % PROMPT_LIMIT)
        return REFUSED
    run_uuid = uuid.uuid4().hex
    in_flight = reserve(inventory, host_name, host, run_uuid, os.environ.get("PAPERCLIP_RUN_ID"))
    if in_flight is None:
        log("account %s has no free reservation; a held run must finish or be reconciled" % host["accountId"])
        return REFUSED
    envelope = build_envelope(inventory, host_name, host, args, prompt.decode("utf-8", "replace"), run_uuid, in_flight, os.environ)
    child = subprocess.Popen(supervisor_command(inventory, host_name, host, "run"), stdin=subprocess.PIPE,
                             stdout=None, stderr=subprocess.PIPE, start_new_session=True)
    receipt = {}

    def pump():
        for raw in iter(child.stderr.readline, b""):
            line = raw.decode("utf-8", "replace")
            if line.startswith(RECEIPT_PREFIX):
                try:
                    receipt.update(json.loads(line[len(RECEIPT_PREFIX):]))
                except ValueError:
                    pass
            sys.stderr.write(line)
            sys.stderr.flush()

    reader = threading.Thread(target=pump, daemon=True)
    reader.start()
    stopping = {"at": None}

    def on_signal(_signum, _frame):
        if stopping["at"] is None:
            stopping["at"] = time.monotonic()
            try:
                child.stdin.write(b"stop\n")
                child.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, on_signal)
    try:
        child.stdin.write((json.dumps(envelope) + "\n").encode())
        child.stdin.flush()
    except (BrokenPipeError, OSError):
        pass
    while child.poll() is None:
        if stopping["at"] is not None and time.monotonic() - stopping["at"] > STOP_GRACE_SEC:
            # The host stops on EOF by itself; this only ends the local transport.
            child.kill()
        time.sleep(0.1)
    reader.join(timeout=5)
    if receipt.get("termination") in ("verified", "not-started") and receipt.get("runUuid") == run_uuid:
        release(inventory, host["accountId"], run_uuid)
    else:
        log("run %s termination not confirmed; account reservation stays held until reconciled" % run_uuid)
    return child.returncode if child.returncode >= 0 else 128 - child.returncode


def reconcile_all(inventory):
    report = []
    for account in sorted({h.get("accountId") for h in inventory.get("hosts", {}).values() if h.get("accountId")}):
        with Ledger(inventory, account) as ledger:
            kept = []
            for entry in ledger.entries:
                state = reconcile_entry(inventory, entry)
                report.append({"account": account, "runUuid": entry.get("runUuid"), "host": entry.get("hostName"), "state": state})
                if state != "terminated":
                    kept.append(entry)
            ledger.entries = kept
            ledger.save()
    print(json.dumps(report, indent=2))
    return 0 if all(r["state"] == "terminated" for r in report) else 1


def main(argv):
    if len(argv) < 3 or argv[0] != "--inventory":
        log("usage: worker.py --inventory INVENTORY (exec --json ... - | reconcile)")
        return 64
    try:
        inventory = load_inventory(argv[1])
    except (OSError, ValueError) as error:
        log("inventory refused: %s" % error)
        return CONFIG
    args = argv[2:]
    if args == ["reconcile"]:
        return reconcile_all(inventory)
    try:
        host_name, host = host_for_agent(inventory, os.environ.get("PAPERCLIP_AGENT_ID"))
        if os.environ.get("PAPERCLIP_HOST_BINDING_SHA256") != binding_digest(host_name, host):
            raise ValueError("registered host binding differs from inventory or is missing; retire and re-enroll")
    except ValueError as error:
        log(str(error))
        return CONFIG
    return relay(inventory, host_name, host, args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
