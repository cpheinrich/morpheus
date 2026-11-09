#!/usr/bin/env python3
"""Build the consumer's freshly fetched main in an isolated, disposable worktree."""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


UDID = re.compile(r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$")
# The Morpheus iOS layout; a consumer with another layout passes --script.
DEFAULT_SCRIPT = "apps/ios/scripts/dev.sh"


def command(argv, *, cwd=None, env=None):
    if env is None:
        env = {key: value for key, value in os.environ.items() if key != "DEVELOPER_DIR"}
    return subprocess.run(argv, cwd=cwd, env=env, text=True, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def validate(repo: Path, device_gate: str = "", build_script: str = DEFAULT_SCRIPT) -> str:
    if device_gate and not UDID.fullmatch(device_gate):
        raise ValueError("device gate requires a hardware UDID")
    relative = Path(build_script)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("build script must be a path inside the consumer checkout")
    developer = os.environ.get("DEVELOPER_DIR", "")
    if not Path(developer).is_absolute() or not Path(developer, "usr/bin/xcodebuild").is_file():
        raise ValueError("DEVELOPER_DIR must select an installed Xcode app")
    repo = repo.resolve()
    sha = command(["git", "-C", str(repo), "rev-parse", "--verify", "origin/main^{commit}"])
    scratch = Path(tempfile.mkdtemp(prefix="factory-consumer-main-"))
    checkout = scratch / "consumer"
    added = False
    try:
        command(["git", "-C", str(repo), "worktree", "add", "--detach", str(checkout), sha])
        added = True
        script = checkout / relative
        if not script.is_file():
            raise RuntimeError(f"consumer main is missing its build script {relative}")
        # The host updater already limited this environment and checked the
        # exact Xcode identity; the build sees only that selected toolchain.
        # A phone-gate host proves the toolchain with a signed build for its
        # connected iPhone, the same build its delivery gate runs.
        action = ["build-device-gate", device_gate] if device_gate else ["build"]
        subprocess.run([str(script), *action], cwd=script.parent.parent, check=True)
        return sha
    finally:
        try:
            if added:
                command(["git", "-C", str(repo), "worktree", "remove", "--force", str(checkout)])
        finally:
            shutil.rmtree(scratch)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--script", default=DEFAULT_SCRIPT, help=f"build script inside the consumer (default {DEFAULT_SCRIPT})")
    parser.add_argument("--device-gate", metavar="UDID", default="", help="run a signed device-gate build for this iPhone")
    args = parser.parse_args()
    if args.device_gate and not UDID.fullmatch(args.device_gate):
        parser.error("--device-gate requires a hardware UDID")
    print(f"validated consumer main {validate(args.repo, args.device_gate, args.script)[:12]}")


if __name__ == "__main__":
    main()
