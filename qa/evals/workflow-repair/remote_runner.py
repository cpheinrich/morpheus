"""Payload-only candidate runner; invoke inside sandbox-exec, never as a grader.

No expected answers, reference code, hidden tests or provider environment belongs
on this host. This runner does not attest sandboxing: the trusted caller must
create and enforce the seatbelt profile and verify the frozen source digest.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import signal
import stat
import sys
import tempfile

LIMIT = 256 * 1024


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError("non-finite JSON number")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--solution", required=True)
    parser.add_argument("--episode", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--temporary", required=True)
    parser.add_argument("--timeout", type=float, default=10)
    args = parser.parse_args()
    if not 0 < args.timeout <= 10:
        raise RuntimeError("invalid timeout")
    root = Path(args.episode).resolve(strict=True)
    source = Path(os.path.abspath(args.solution))
    relative = source.relative_to(root)
    current = root
    for part in relative.parts:
        current /= part
        if stat.S_ISLNK(current.lstat().st_mode):
            raise RuntimeError("symlink source")
    if not stat.S_ISREG(source.lstat().st_mode):
        raise RuntimeError("source is not regular")
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != args.sha256:
        raise RuntimeError("source digest mismatch")
    raw = sys.stdin.buffer.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise RuntimeError("oversized request")
    request = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                         parse_constant=_invalid_constant)
    if not isinstance(request, dict) or set(request) != {"payload"}:
        raise RuntimeError("invalid request")
    resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT, LIMIT))
    resource.setrlimit(resource.RLIMIT_CPU, (math.ceil(args.timeout), math.ceil(args.timeout)))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    signal.alarm(math.ceil(args.timeout))
    # Capture native fd writes as well as print(). Candidate output is never an
    # RPC answer. os._exit during candidate execution leaves no protocol reply.
    sys.stdout.flush()
    sys.stderr.flush()
    original_stdout = os.dup(1)
    original_stderr = os.dup(2)
    reply = None
    failure = None
    with tempfile.TemporaryFile(dir=args.temporary) as captured:
        os.dup2(captured.fileno(), 1)
        os.dup2(captured.fileno(), 2)
        try:
            # Compile the hashed bytes directly; never reopen source for import.
            namespace = {"__name__": "candidate_solution", "__file__": str(source)}
            exec(compile(data, str(source), "exec"), namespace)
            solve = namespace.get("solve")
            if not callable(solve):
                raise RuntimeError("missing solve(payload)")
            try:
                answer = solve(request["payload"])
            except ValueError:
                reply = {"protocol": 1, "error": "ValueError"}
            else:
                reply = {"protocol": 1, "result": answer}
                # Serialization failures are transport errors, never candidate
                # ValueError outcomes expected by invalid-input test cases.
                json.dumps(reply, allow_nan=False)
        except BaseException as exc:
            failure = type(exc).__name__
        finally:
            sys.stdout.flush()
            sys.stderr.flush()
            os.dup2(original_stdout, 1)
            os.dup2(original_stderr, 2)
            os.close(original_stdout)
            os.close(original_stderr)
        if os.fstat(captured.fileno()).st_size != 0:
            raise RuntimeError("candidate emitted output")
    if failure is not None:
        raise RuntimeError("candidate failed: " + failure)
    encoded = json.dumps(reply, allow_nan=False, separators=(",", ":")).encode()
    if len(encoded) > LIMIT:
        raise RuntimeError("oversized reply")
    sys.stdout.buffer.write(encoded + b"\n")
    sys.stdout.buffer.flush()
    signal.alarm(0)


if __name__ == "__main__":
    try:
        main()
    except BaseException as exc:
        # Error type/details cannot be mistaken for candidate ValueError.
        os.write(2, ("candidate RPC failed: " + type(exc).__name__ + ": " + str(exc)[:256] + "\n").encode("utf-8", "replace"))
        sys.exit(2)
