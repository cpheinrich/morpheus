#!/bin/bash
# Explicit, rerunnable macOS factory worker setup. Never run by the plugin
# installer or by Morpheus; run it from this package (installed plugin copy or
# source checkout). --check reports and changes nothing.
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_CODE_ROOT="$HOME/code"
WORKER_CHECK_ONLY=0
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
while (($#)); do
  case "$1" in
    --check) WORKER_CHECK_ONLY=1; shift ;;
    --code-root) [[ $# -ge 2 ]] || { echo "Missing value for --code-root" >&2; exit 2; }; WORKER_CODE_ROOT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$WORKER_CODE_ROOT" == /* ]] || { echo "--code-root must be an absolute path" >&2; exit 2; }
[[ -f "$FACTORY_ROOT/worker/host_config.py" && -f "$FACTORY_ROOT/package.json" ]] || { echo "Run from the Factory host package" >&2; exit 1; }
export FACTORY_ROOT WORKER_CODE_ROOT WORKER_CHECK_ONLY

for stage in prerequisites apps tools root-helper source morpheus spotlight factory cleanup; do
  echo "== $stage"
  bash "$FACTORY_ROOT/worker/setup/$stage.sh"
done

if ((WORKER_CHECK_ONLY)); then
  echo "Check complete; no changes made."
else
  echo "Local factory prerequisites are ready."
  echo "Fleet activation still needs a private host manifest (python3 worker/host_config.py import --from <file>),"
  echo "broker access and provider CLIs. No provider credentials are copied by this script."
  echo "Hosts that serve CI/CD: register a runner with worker/runner.sh install (token on stdin)."
  echo "Xcode pins: python3 worker/install_updates.py --host <host> --github-user <login> (docs/host-updates.md)."
fi
