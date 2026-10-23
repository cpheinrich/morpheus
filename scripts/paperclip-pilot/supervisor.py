#!/usr/bin/python3
"""Run one Paperclip Codex turn in the foreground on this host, then prove it ended.

The controller-side wrapper (worker.py) starts this locally or over SSH and keeps
stdin open. Line one is a JSON envelope (run id, binding, Codex arguments, the
PAPERCLIP_* variables and the prompt); afterwards EOF means the controller or the
SSH session is gone, and the run stops. The run token only ever travels on stdin.

Everything that binds the run to this host - agent, account, workspace, Codex
binary, model, effort, quota limits - comes from an operator-owned config file
outside the model-writable workspace. The envelope can request, never override.

Ownership is an environment marker on every model process (the guarded-run.py
pattern): a census finds them even after reparenting or a new process group, so a
fresh supervisor never has to assume a detached child is gone. A slot is a
kernel flock whose descriptor the model inherits, so it stays held while the
model lives even if this supervisor is killed. A slot whose last run cannot be
shown terminated is quarantined, never reused.

Stdout carries only the model's exact JSONL. Diagnostics go to stderr; the last
stderr line is `MORPHEUS_PAPERCLIP_RECEIPT {json}` without secrets.
"""
import fcntl
import hashlib
import json
import math
import os
import pwd
import re
import select
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

CONFIG_SCHEMA = "morpheus-paperclip-host/1"
ENVELOPE_SCHEMA = "morpheus-paperclip-envelope/1"
MARKER = "MORPHEUS_PAPERCLIP_RUN_OWNER"
RECEIPT_PREFIX = "MORPHEUS_PAPERCLIP_RECEIPT "
ENVELOPE_LIMIT = 4 * 1024 * 1024
REFUSED, STOPPED, UNKNOWN, CONFIG = 75, 124, 125, 78
DEFAULT_CENSUS = ["/bin/ps", "axeww", "-o", "pid=,lstart=,command="]
RUN_ID = re.compile(r"^[0-9a-f]{32}$")
ENV_NAME = re.compile(r"^PAPERCLIP_[A-Z0-9_]{1,64}$")
SESSION_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
TERMINAL = ("verified", "not-started")


class Refusal(Exception):
    pass


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def digest(value):
    data = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode()
    return hashlib.sha256(data).hexdigest()


def log(message):
    sys.stderr.write("paperclip-supervisor: %s\n" % message)
    sys.stderr.flush()


def write_json(path, value):
    tmp = "%s.%d.tmp" % (path, os.getpid())
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def read_json(path):
    try:
        with open(path) as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None


def inside(child, parent):
    child, parent = os.path.realpath(child), os.path.realpath(parent)
    return child == parent or child.startswith(parent.rstrip("/") + "/")


def load_config(path):
    """Refuse a binding the model could have written or another user could edit."""
    if not os.path.isabs(path):
        raise Refusal("config path must be absolute")
    info = os.stat(path)
    if info.st_uid != os.getuid() or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        raise Refusal("config must be owned by this user and not group/world writable")
    with open(path) as handle:
        config = json.load(handle)
    if config.get("schema") != CONFIG_SCHEMA:
        raise Refusal("unknown config schema")
    for key in ("hostId", "agentId", "accountId", "model", "effort"):
        if not isinstance(config.get(key), str) or not config[key]:
            raise Refusal("config.%s is required" % key)
    for key in ("workspace", "codexCommand", "stateDir"):
        if not isinstance(config.get(key), str) or not os.path.isabs(config[key]):
            raise Refusal("config.%s must be an absolute path" % key)
    if not os.path.isdir(config["workspace"]):
        raise Refusal("workspace does not exist")
    if inside(config["stateDir"], config["workspace"]):
        raise Refusal("config.stateDir must be outside the workspace")
    if inside(path, config["workspace"]):
        raise Refusal("config must be outside the workspace")
    quota = config.get("quotaCommand")
    if not isinstance(quota, list) or not quota or not all(isinstance(a, str) and a for a in quota):
        raise Refusal("config.quotaCommand must be a non-empty argv list")
    limits = config.get("limits")
    if not isinstance(limits, dict) or not limits:
        raise Refusal("config.limits is required")
    for window, limit in limits.items():
        stop, hard = limit.get("stopAt"), limit.get("hardAt")
        if not all(isinstance(v, (int, float)) and 0 < v <= 100 for v in (stop, hard)) or stop > hard:
            raise Refusal("config.limits.%s needs 0 < stopAt <= hardAt <= 100" % window)
    config.setdefault("slots", 1)
    config.setdefault("maxRunSec", 170)
    config.setdefault("quotaTimeoutSec", 75)
    config.setdefault("quotaFreshSec", 120)
    config.setdefault("meterIntervalSec", 60)
    config.setdefault("reservePp", 2.5)
    config.setdefault("path", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
    config.setdefault("census", DEFAULT_CENSUS)
    if not (isinstance(config["slots"], int) and 1 <= config["slots"] <= 8):
        raise Refusal("config.slots must be 1-8")
    if not (isinstance(config["maxRunSec"], (int, float)) and 1 <= config["maxRunSec"] <= 3600):
        raise Refusal("config.maxRunSec must be 1-3600")
    for sub in ("slots", "receipts"):
        os.makedirs(os.path.join(config["stateDir"], sub), mode=0o700, exist_ok=True)
    return config


# --- Codex argument grammar --------------------------------------------------
# Paperclip's codex_local builds: exec --json [-c sandbox...] [--skip-git-repo-check]
# --model M [-c model_reasoning_effort="E"] [extraArgs] (resume ID -|-). Accept that
# shape only, with this host's model and effort. Anything that could change the
# workspace, home, profile, provider or billing route is refused, never dropped.
def validate_args(args, config):
    if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
        raise Refusal("args must be a string list")
    if args[:2] != ["exec", "--json"] or args[-1:] != ["-"]:
        raise Refusal("args must be exec --json ... - with the prompt on stdin")
    resume = len(args) >= 5 and args[-3] == "resume"
    if resume and not SESSION_ID.match(args[-2]):
        raise Refusal("resume session id is malformed")
    body, i, model, effort, sandbox = args[2:-3] if resume else args[2:-1], 0, None, None, False
    while i < len(body):
        arg, value = body[i], body[i + 1] if i + 1 < len(body) else None
        if arg == "--skip-git-repo-check":
            i += 1
        elif arg == "--model" and value is not None:
            model, i = value, i + 2
        elif arg == "-c" and value is not None:
            match = re.match(r'^model_reasoning_effort="([a-z]+)"$', value)
            if match:
                effort = match.group(1)
            elif value == 'sandbox_mode="workspace-write"':
                sandbox = True
            elif value not in ("sandbox_workspace_write.network_access=true", "sandbox_workspace_write.network_access=false"):
                raise Refusal("config override is not allowed: %s" % value.split("=", 1)[0])
            i += 2
        else:
            raise Refusal("argument is not allowed: %s" % arg.split("=", 1)[0])
    if model != config["model"]:
        raise Refusal("model must be %s" % config["model"])
    if effort != config["effort"]:
        raise Refusal("reasoning effort must be %s" % config["effort"])
    if not sandbox:
        raise Refusal("workspace-write sandbox is required")
    return {"resume": resume}


# --- Quota admission ---------------------------------------------------------
def read_quota(config, timeout=None, holder=None):
    """Run the configured nativeQuota helper; any failure is unknown, never zero."""
    try:
        proc = subprocess.Popen(config["quotaCommand"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                stdin=subprocess.DEVNULL, start_new_session=True, cwd=config["workspace"])
    except OSError:
        return None, "quota reader could not start"
    if holder is not None:
        holder["proc"] = proc
    try:
        out, _ = proc.communicate(timeout=timeout or config["quotaTimeoutSec"])
    except subprocess.TimeoutExpired:
        stop_group(proc)
        return None, "quota read timed out"
    if proc.returncode != 0:
        return None, "quota read failed"
    try:
        return json.loads(out.decode()), None
    except ValueError:
        return None, "quota read returned malformed output"


def stop_group(proc):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, sig)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            proc.wait(timeout=3)
            return
        except subprocess.TimeoutExpired:
            continue


def parse_time(value):
    try:
        return datetime.strptime(value.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S.%f%z").timestamp()
    except (AttributeError, ValueError):
        try:
            return datetime.strptime(value.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z").timestamp()
        except (AttributeError, ValueError):
            return None


def judge_quota(snapshot, config, in_flight, now=None, gate="stopAt"):
    """Return (decision, detail). Unknown or stale telemetry refuses admission.

    Provider telemetry lags, so another run already in flight on the same account is
    charged `reservePp` it may not have reported yet. This narrows overshoot; it does
    not make it impossible, which is why stopAt sits below the hard ceiling.
    """
    now = time.time() if now is None else now
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("windows"), list) or not snapshot["windows"]:
        return "unknown", "no quota windows"
    observed = parse_time(snapshot.get("observedAt"))
    if observed is None or observed > now + 5 or now - observed > config["quotaFreshSec"]:
        return "unknown", "quota observation is stale or undated"
    charged = max(0, int(in_flight) - 1) * float(config["reservePp"])
    worst = None
    for window in snapshot["windows"]:
        limit = config["limits"].get(window.get("id"))
        used, resets = window.get("usedPercent"), parse_time(window.get("resetsAt"))
        if limit is None:
            return "unknown", "quota window %r has no configured limit" % window.get("id")
        if not isinstance(used, (int, float)) or isinstance(used, bool) or not math.isfinite(used) or not 0 <= used <= 100:
            return "unknown", "quota window %s has no valid usage" % window.get("id")
        if resets is None or resets <= now:
            return "unknown", "quota window %s has no future reset" % window.get("id")
        if used + charged >= limit[gate]:
            return "refuse", "window %s at %.1f%% (+%.1fpp in flight) reaches %s %.1f%%" % (window["id"], used, charged, gate, limit[gate])
        worst = max(worst or 0, used)
    return "admit", "highest window %.1f%% with %d in flight" % (worst, in_flight)


def sanitize_quota(snapshot):
    if not isinstance(snapshot, dict):
        return None
    windows = [{k: w.get(k) for k in ("id", "usedPercent", "resetsAt")} for w in snapshot.get("windows", []) if isinstance(w, dict)]
    return {"observedAt": snapshot.get("observedAt"), "source": snapshot.get("source"), "windows": windows}


# --- Process identity and census ---------------------------------------------
def census(config):
    """Return {pid: birth} for processes carrying a run marker. Never persist raw rows:
    `ps e` includes environments, which may contain credentials."""
    try:
        rows = subprocess.check_output(config["census"], text=True, timeout=20, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    found = {}
    for line in rows.splitlines():
        fields = line.split(None, 6)
        if len(fields) == 7:
            for match in re.finditer(r"(?:^|\s)" + MARKER + r"=([0-9a-f]{32})(?:\s|$)", fields[6]):
                found.setdefault(match.group(1), {})[int(fields[0])] = " ".join(fields[1:6])
    return found


def birth_of(pid):
    try:
        out = subprocess.check_output(["/bin/ps", "-o", "lstart=", "-p", str(pid)], text=True, timeout=10, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    return " ".join(out.split()) or None


def terminate_owned(config, run_uuid):
    """Freeze, terminate and kill exactly the census-identified processes of one run.
    Returns True only when a later census shows none remain."""
    def owned():
        table = census(config)
        return None if table is None else table.get(run_uuid, {})

    def send(targets, sig):
        current = owned() or {}
        for pid, birth in targets.items():
            if current.get(pid) == birth:
                try:
                    os.kill(pid, sig)
                except (ProcessLookupError, PermissionError):
                    pass

    targets = owned()
    if targets is None:
        return False
    if not targets:
        return True
    send(targets, signal.SIGSTOP)
    targets = owned() or targets
    send(targets, signal.SIGTERM)
    send(targets, signal.SIGCONT)
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        remaining = owned()
        if remaining == {}:
            return True
        time.sleep(0.1)
    send(owned() or targets, signal.SIGKILL)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if owned() == {}:
            return True
        time.sleep(0.1)
    return False


def receipt_path(config, run_uuid):
    return os.path.join(config["stateDir"], "receipts", run_uuid + ".json")


def reconcile(config, run_uuid):
    """Decide whether a previous run is provably over: terminated, active or quarantined."""
    receipt = read_json(receipt_path(config, run_uuid)) or {}
    if receipt.get("termination") in TERMINAL:
        return "terminated"
    sup = receipt.get("supervisor") or {}
    if sup.get("pid") and sup.get("birth") and birth_of(sup["pid"]) == sup["birth"]:
        return "active"
    if terminate_owned(config, run_uuid):
        receipt.update({"termination": "verified", "reconciledAt": now_iso(), "state": "reconciled"})
        receipt.setdefault("runUuid", run_uuid)
        write_json(receipt_path(config, run_uuid), receipt)
        return "terminated"
    receipt.update({"termination": "unknown", "quarantinedAt": now_iso()})
    receipt.setdefault("runUuid", run_uuid)
    write_json(receipt_path(config, run_uuid), receipt)
    return "quarantined"


# --- Slots -------------------------------------------------------------------
def acquire_slot(config, run_uuid):
    for n in range(config["slots"]):
        lock = os.path.join(config["stateDir"], "slots", "slot-%d.lock" % n)
        meta_path = os.path.join(config["stateDir"], "slots", "slot-%d.json" % n)
        fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            continue
        meta = read_json(meta_path) or {}
        previous = meta.get("runUuid")
        if previous and (meta.get("state") != "released" or meta.get("quarantined")):
            outcome = reconcile(config, previous)
            if outcome != "terminated":
                if outcome == "quarantined":
                    meta.update({"quarantined": True, "state": "quarantined"})
                    write_json(meta_path, meta)
                os.close(fd)
                continue
        write_json(meta_path, {"runUuid": run_uuid, "state": "held", "at": now_iso()})
        return n, fd, meta_path
    return None, None, None


def release_slot(fd, meta_path, run_uuid, quarantined):
    meta = {"runUuid": run_uuid, "state": "quarantined" if quarantined else "released", "at": now_iso()}
    if quarantined:
        meta["quarantined"] = True
    write_json(meta_path, meta)
    os.close(fd)


# --- Run ---------------------------------------------------------------------
def read_envelope():
    data = b""
    while b"\n" not in data:
        chunk = os.read(0, 65536)
        if not chunk:
            raise Refusal("stdin closed before the envelope")
        data += chunk
        if len(data) > ENVELOPE_LIMIT:
            raise Refusal("envelope too large")
    line, rest = data.split(b"\n", 1)
    envelope = json.loads(line.decode())
    if envelope.get("schema") != ENVELOPE_SCHEMA:
        raise Refusal("unknown envelope schema")
    if not RUN_ID.match(str(envelope.get("runUuid", ""))):
        raise Refusal("runUuid is malformed")
    return envelope, rest


def child_env(config, envelope):
    env = envelope.get("env")
    if not isinstance(env, dict) or not all(ENV_NAME.match(k) and isinstance(v, str) for k, v in env.items()):
        raise Refusal("only PAPERCLIP_* string variables may be forwarded")
    account = pwd.getpwuid(os.getuid())
    # Built from nothing: CODEX_HOME, provider keys and the controller's own
    # environment never reach the model. Codex uses this host's existing login.
    result = {"HOME": account.pw_dir, "USER": account.pw_name, "LOGNAME": account.pw_name,
              "PATH": config["path"], "LANG": os.environ.get("LANG", "en_US.UTF-8"),
              "TMPDIR": os.environ.get("TMPDIR", "/tmp")}
    result.update(env)
    result[MARKER] = envelope["runUuid"]
    return result


class Run:
    def __init__(self, config, envelope):
        self.config, self.envelope = config, envelope
        self.uuid = envelope["runUuid"]
        self.stop_reason = None
        self.receipt = {
            "schema": "morpheus-paperclip-receipt/1", "runUuid": self.uuid,
            "paperclipRunId": (envelope.get("env") or {}).get("PAPERCLIP_RUN_ID"),
            "agentId": config["agentId"], "hostId": config["hostId"], "accountId": config["accountId"],
            "model": config["model"], "effort": config["effort"], "workspace": config["workspace"],
            "argsDigest": digest(envelope.get("args")), "promptDigest": digest((envelope.get("prompt") or "").encode()),
            "supervisor": {"pid": os.getpid(), "birth": birth_of(os.getpid())},
            # "pending" until a refusal or a census settles it: a crash at any later
            # point must leave reconcile something to check, not a false "not-started".
            "state": "admitting", "termination": "pending", "createdAt": now_iso(),
        }
        self.save()

    def save(self):
        write_json(receipt_path(self.config, self.uuid), self.receipt)

    def finish(self, state, termination, code, **extra):
        self.receipt.update({"state": state, "termination": termination, "exitCode": code, "endedAt": now_iso()}, **extra)
        self.save()
        public = {k: self.receipt.get(k) for k in ("runUuid", "paperclipRunId", "hostId", "agentId", "accountId", "model", "effort", "state", "termination", "exitCode", "stopReason", "slot", "quotaDecision")}
        sys.stderr.write(RECEIPT_PREFIX + json.dumps(public, sort_keys=True) + "\n")
        sys.stderr.flush()
        return code


def run(config_path):
    try:
        config = load_config(config_path)
    except (Refusal, OSError, ValueError) as error:
        log("config refused: %s" % error)
        return CONFIG
    try:
        envelope, trailing = read_envelope()
    except (Refusal, ValueError, OSError) as error:
        log("envelope refused: %s" % error)
        return CONFIG
    if envelope.get("hostId") != config["hostId"] or envelope.get("agentId") != config["agentId"]:
        log("envelope binding does not match this host's agent; refusing")
        return CONFIG
    if not (isinstance(envelope.get("inFlight"), int) and 1 <= envelope["inFlight"] <= 16):
        log("envelope inFlight must be an integer 1-16")
        return CONFIG
    record = Run(config, envelope)
    try:
        validate_args(envelope.get("args"), config)
        env = child_env(config, envelope)
        if trailing.strip():
            raise Refusal("unexpected data after the envelope")
    except Refusal as error:
        return record.finish("refused", "not-started", REFUSED, stopReason=str(error))

    slot, slot_fd, slot_meta = acquire_slot(config, record.uuid)
    if slot is None:
        return record.finish("refused", "not-started", REFUSED, stopReason="no free host slot")
    record.receipt["slot"] = slot
    snapshot, error = read_quota(config)
    decision, detail = ("unknown", error) if error else judge_quota(snapshot, config, envelope["inFlight"])
    record.receipt.update({"quotaBefore": sanitize_quota(snapshot), "quotaDecision": decision, "quotaDetail": detail})
    if decision != "admit":
        release_slot(slot_fd, slot_meta, record.uuid, False)
        return record.finish("refused", "not-started", REFUSED, stopReason="quota " + decision + ": " + detail)

    stop_flag = {"reason": None}

    def on_signal(signum, _frame):
        stop_flag["reason"] = stop_flag["reason"] or "signal %d" % signum

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, on_signal)

    try:
        child = subprocess.Popen([config["codexCommand"]] + envelope["args"], cwd=config["workspace"], env=env,
                                 stdin=subprocess.PIPE, stdout=None, stderr=None, start_new_session=True,
                                 pass_fds=(slot_fd,))
    except OSError:
        release_slot(slot_fd, slot_meta, record.uuid, False)
        return record.finish("refused", "not-started", REFUSED, stopReason="model command could not start")
    record.receipt.update({"state": "running", "child": {"pid": child.pid, "birth": birth_of(child.pid)}, "startedAt": now_iso(),
                           "deadlineAt": datetime.fromtimestamp(time.time() + config["maxRunSec"], timezone.utc).isoformat()})
    record.save()

    def feed():
        try:
            child.stdin.write((envelope.get("prompt") or "").encode())
            child.stdin.close()
        except (BrokenPipeError, OSError):
            pass

    threading.Thread(target=feed, daemon=True).start()
    deadline = time.monotonic() + config["maxRunSec"]
    next_meter = time.monotonic() + config["meterIntervalSec"] if config["meterIntervalSec"] else None
    meter = None
    stdin_open = True
    while child.poll() is None and not stop_flag["reason"]:
        if time.monotonic() >= deadline:
            stop_flag["reason"] = "deadline"
            break
        if stdin_open:
            readable, _, _ = select.select([0], [], [], 0.1)
            if readable:
                data = os.read(0, 4096)
                if not data:
                    stdin_open = False
                    stop_flag["reason"] = "controller connection lost"
                elif b"stop" in data:
                    stop_flag["reason"] = "cancel requested"
        else:
            time.sleep(0.1)
        if next_meter and meter is None and time.monotonic() >= next_meter:
            meter = {"result": None}
            def take(box=meter):
                box["result"] = read_quota(config, min(config["quotaTimeoutSec"], max(1, deadline - time.monotonic())), box)
            meter["thread"] = threading.Thread(target=take, daemon=True)
            meter["thread"].start()
        if meter is not None and meter["result"] is not None:
            snap, err = meter["result"]
            verdict, why = ("unknown", err) if err else judge_quota(snap, config, envelope["inFlight"], gate="hardAt")
            record.receipt.setdefault("meter", []).append({"decision": verdict, "detail": why, "quota": sanitize_quota(snap)})
            record.save()
            if verdict != "admit":
                # Unknown mid-run telemetry stops the model as firmly as a breach.
                stop_flag["reason"] = "meter " + verdict + ": " + why
            meter, next_meter = None, time.monotonic() + config["meterIntervalSec"]

    reason = stop_flag["reason"]
    code = child.poll()
    if meter is not None and meter.get("proc") is not None and meter["proc"].poll() is None:
        stop_group(meter["proc"])  # A quota reader, not a model; do not leave it behind.
    verified = terminate_owned(config, record.uuid)
    if child.poll() is None:
        # The leader is still ours (unreaped) even if the census failed.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        verified = False
    release_slot(slot_fd, slot_meta, record.uuid, not verified)
    if not verified:
        return record.finish("quarantined", "unknown", UNKNOWN, stopReason=reason or "survivors after exit")
    if reason:
        return record.finish("stopped", "verified", STOPPED, stopReason=reason)
    return record.finish("exited", "verified", child.returncode if code is None else code)


def status(config_path):
    config = load_config(config_path)
    slots = []
    for n in range(config["slots"]):
        meta = read_json(os.path.join(config["stateDir"], "slots", "slot-%d.json" % n)) or {}
        fd = os.open(os.path.join(config["stateDir"], "slots", "slot-%d.lock" % n), os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            busy = False
            fcntl.flock(fd, fcntl.LOCK_UN)
        except BlockingIOError:
            busy = True
        os.close(fd)
        slots.append({"slot": n, "busy": busy, "state": meta.get("state", "free"), "runUuid": meta.get("runUuid"), "quarantined": bool(meta.get("quarantined"))})
    receipts_dir = os.path.join(config["stateDir"], "receipts")
    names = sorted(os.listdir(receipts_dir), key=lambda n: os.path.getmtime(os.path.join(receipts_dir, n)))[-10:]
    recent = []
    for name in names:
        r = read_json(os.path.join(receipts_dir, name)) or {}
        recent.append({k: r.get(k) for k in ("runUuid", "paperclipRunId", "state", "termination", "exitCode", "stopReason", "quotaDecision", "createdAt", "endedAt")})
    print(json.dumps({"hostId": config["hostId"], "agentId": config["agentId"], "accountId": config["accountId"],
                      "model": config["model"], "effort": config["effort"], "codex": bool(shutil.which(config["codexCommand"])),
                      "slots": slots, "recent": recent}, indent=2))
    return 0


def main(argv):
    if len(argv) < 3 or argv[0] != "--config":
        sys.stderr.write("usage: supervisor.py --config HOST.json (run | status | reconcile RUN_UUID)\n")
        return 64
    command = argv[2]
    if command == "run":
        return run(argv[1])
    try:
        if command == "status":
            return status(argv[1])
        if command == "reconcile" and len(argv) == 4 and RUN_ID.match(argv[3]):
            outcome = reconcile(load_config(argv[1]), argv[3])
            print(json.dumps({"runUuid": argv[3], "state": outcome}))
            return 0 if outcome == "terminated" else 1
    except (Refusal, OSError, ValueError) as error:
        log("refused: %s" % error)
        return CONFIG
    sys.stderr.write("unknown command\n")
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
