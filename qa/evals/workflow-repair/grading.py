"""Controller-only grading and a narrow, strict JSON subprocess transport.

Hidden tests receive only ``call(payload)``. Never copy hidden tests or reference
solutions to the candidate host. The caller must stop model processes before
freezing artifacts, and read back the remote source digest before grading.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import selectors
import signal
import stat
import subprocess
import sys
import sysconfig
import tempfile
import time
import unittest

OUTPUT_LIMIT = 256 * 1024
TIME_LIMIT = 10.0


class RPCError(RuntimeError):
    pass


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def strict_json(data):
    def invalid_constant(value):
        raise ValueError("non-finite JSON number")
    return json.loads(data, object_pairs_hook=_pairs, parse_constant=invalid_constant)


def freeze_source(solution, episode, expected_sha256=None):
    """Reject symlinks in every relative component and return a content digest."""
    lexical_root = Path(os.path.abspath(episode))
    if lexical_root.is_symlink():
        raise RPCError("episode root must not be a symlink")
    root = lexical_root.resolve(strict=True)
    raw = Path(os.path.abspath(solution))
    try:
        relative = raw.relative_to(lexical_root)
    except ValueError as exc:
        raise RPCError("solution is outside the expected episode") from exc
    current = root
    for part in relative.parts:
        current = current / part
        if stat.S_ISLNK(current.lstat().st_mode):
            raise RPCError("symlink source or parent")
    if not stat.S_ISREG(current.lstat().st_mode):
        raise RPCError("solution must be a regular file")
    digest = hashlib.sha256(current.read_bytes()).hexdigest()
    if expected_sha256 is not None and digest != expected_sha256:
        raise RPCError("source digest mismatch")
    return digest


def _sb_string(value):
    # JSON strings use the quoting needed by this restricted profile template.
    return json.dumps(str(value))


def runtime_python(executable=None):
    """Framework Python's bin stub spawns this real interpreter on macOS."""
    if executable is not None:
        return str(Path(executable).resolve())
    framework_binary = Path(sys.prefix) / "Resources/Python.app/Contents/MacOS/Python"
    return str(framework_binary if framework_binary.is_file() else Path(sys.executable).resolve())


def sandbox_profile(solution, runner, temporary, python_executable=None,
                    runtime_roots=None):
    """Paths must describe the candidate host, not controller oracle locations.

    Runtime roots are trusted Python/Apple installations only. Do not pass a home
    directory, a broad project directory, or an agent-writable runtime directory.
    """
    executable = Path(runtime_python(python_executable)).resolve()
    if runtime_roots is None:
        runtime_roots = [sys.prefix, sys.base_prefix,
                         sysconfig.get_path("stdlib"),
                         "/System/Library", "/usr/lib",
                         "/private/var/db/dyld"]
    reads = "\n".join("  (subpath %s)" % _sb_string(Path(p).resolve())
                      for p in sorted(set(map(str, runtime_roots))))
    literals = "\n".join("  (literal %s)" % _sb_string(Path(p).resolve())
                         for p in [solution, runner, executable,
                                   "/", "/dev/null", "/dev/urandom", "/dev/random"])
    return """(version 1)
(deny default)
(allow process-exec (literal %s))
(allow sysctl-read)
(allow file-read*
%s
%s
  (subpath %s))
(allow file-write* (subpath %s))
""" % (_sb_string(executable), reads, literals,
         _sb_string(Path(temporary).resolve()),
         _sb_string(Path(temporary).resolve()))


def run_json_command(command, payload, timeout=TIME_LIMIT,
                     output_limit=OUTPUT_LIMIT, cwd=None, env=None):
    """One payload per isolated process; stderr counts toward the output cap."""
    if not 0 < timeout <= TIME_LIMIT or not 0 < output_limit <= OUTPUT_LIMIT:
        raise ValueError("transport bounds exceed the declared limits")
    try:
        request = json.dumps({"payload": payload}, allow_nan=False,
                             separators=(",", ":")).encode() + b"\n"
    except (TypeError, ValueError) as exc:
        raise RPCError("non-JSON request") from exc
    if len(request) > OUTPUT_LIMIT:
        raise RPCError("request too large")
    request_stream = tempfile.TemporaryFile()
    request_stream.write(request)
    request_stream.seek(0)
    process = subprocess.Popen(command, stdin=request_stream,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               cwd=cwd, env=env, start_new_session=True)
    deadline = time.monotonic() + timeout
    chunks = {"stdout": bytearray(), "stderr": bytearray()}
    selector = selectors.DefaultSelector()
    try:
        for name in chunks:
            pipe = getattr(process, name)
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RPCError("RPC timeout")
            for key, _ in selector.select(min(remaining, 0.05)):
                block = os.read(key.fileobj.fileno(), 65536)
                if not block:
                    selector.unregister(key.fileobj)
                else:
                    chunks[key.data].extend(block)
                    if sum(map(len, chunks.values())) > output_limit:
                        raise RPCError("RPC output overflow")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RPCError("RPC timeout")
        try:
            code = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired as exc:
            raise RPCError("RPC timeout") from exc
        if code != 0:
            raise RPCError("RPC nonzero exit: %s" % code)
        try:
            reply = strict_json(bytes(chunks["stdout"]).decode("utf-8"))
        except (ValueError, UnicodeError) as exc:
            raise RPCError("malformed or multiple RPC answers") from exc
        if (not isinstance(reply, dict) or type(reply.get("protocol")) is not int
                or reply["protocol"] != 1):
            raise RPCError("invalid RPC envelope")
        if set(reply) == {"protocol", "result"}:
            return reply["result"]
        if reply == {"protocol": 1, "error": "ValueError"}:
            raise ValueError("candidate rejected payload")
        raise RPCError("invalid RPC envelope")
    finally:
        selector.close()
        # Also kill descendants if the leader exited while leaving inherited
        # pipes or background children. Applies to local tests; an SSH caller
        # must additionally verify remote termination.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        for pipe in [process.stdout, process.stderr]:
            pipe.close()
        request_stream.close()


class LocalSandboxRPC:
    """Local qualification helper; production SSH transport is caller-owned."""
    def __init__(self, solution, episode, expected_sha256, timeout=TIME_LIMIT,
                 runner=None, python_executable=None):
        self.digest = freeze_source(solution, episode, expected_sha256)
        self.solution = str(Path(solution).resolve(strict=True))
        self.episode = str(Path(episode).resolve(strict=True))
        self.timeout = timeout
        self.runner = str(Path(runner or Path(__file__).with_name("remote_runner.py")).resolve())
        self.python = runtime_python(python_executable)

    def __call__(self, payload):
        sandbox = Path("/usr/bin/sandbox-exec")
        if not sandbox.is_file() or not os.access(sandbox, os.X_OK):
            raise RPCError("sandbox-exec unavailable; refusing unsandboxed execution")
        freeze_source(self.solution, self.episode, self.digest)
        with tempfile.TemporaryDirectory(prefix="workflow-rpc-") as directory:
            directory = str(Path(directory).resolve())
            profile = sandbox_profile(self.solution, self.runner, directory, self.python)
            command = [str(sandbox), "-p", profile, self.python, "-I", "-S", "-B",
                       self.runner, "--solution", self.solution,
                       "--episode", self.episode, "--sha256", self.digest,
                       "--temporary", directory, "--timeout", str(self.timeout)]
            env = {"PATH": "/usr/bin:/bin", "HOME": directory,
                   "TMPDIR": directory, "LANG": "C", "PYTHONDONTWRITEBYTECODE": "1"}
            return run_json_command(command, payload, self.timeout, cwd=directory, env=env)


def grade_hidden(hidden_test_file, call):
    """Execute trusted tests on controller; ``call`` is the only candidate hook."""
    namespace = runpy.run_path(str(hidden_test_file),
                              init_globals={"call": call},
                              run_name="trusted_hidden_case")
    suite = unittest.TestSuite()
    loader = unittest.TestLoader()
    for value in namespace.values():
        if (isinstance(value, type) and issubclass(value, unittest.TestCase)
                and value is not unittest.TestCase):
            suite.addTests(loader.loadTestsFromTestCase(value))
    if suite.countTestCases() == 0:
        raise RPCError("hidden grader contains no tests")
    stream = io.StringIO()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    return {"passed": result.wasSuccessful(), "tests_run": result.testsRun,
            "failures": len(result.failures), "errors": len(result.errors),
            "report": stream.getvalue()}
