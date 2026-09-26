#!/bin/sh
# morpheus:session-start:v1
set -u
PATH="${PATH:-/usr/bin:/bin}:${HOME:-/nonexistent}/.local/bin:/opt/homebrew/bin:/usr/local/bin"
export PATH

# A hook-health failure does not mean this CLI predates auto-update.
if command -v morpheus >/dev/null 2>&1; then
  status_output=$(morpheus self auto-update status 2>&1)
  status_code=$?
  case "$status_output" in
    *"Morpheus auto-update:"*|*"Could not status Morpheus auto-update:"*)
      if [ "$status_code" -ne 0 ]; then printf '%s\n' "$status_output" >&2; fi
      exec morpheus context brief
      ;;
  esac
  if [ "$status_code" -eq 0 ]; then exec morpheus context brief; fi
fi

config_path="${MORPHEUS_AUTO_UPDATE_CONFIG:-${HOME:?HOME is required}/.morpheus/auto-update.json}"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "Morpheus could not start, and Node is unavailable to inspect the saved preference at $config_path. Repair the tool PATH; do not ask to enable updates again." >&2
  exit 1
fi
preference=$(node -e '
  const fs = require("node:fs");
  let raw;
  try { raw = fs.readFileSync(process.argv[1], "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") { process.stdout.write("absent"); process.exit(0); }
    process.exit(1);
  }
  try {
    const value = JSON.parse(raw);
    if (value.schema !== 1 || typeof value.enabled !== "boolean" || typeof value.changedAt !== "string") process.exit(1);
    process.stdout.write(value.enabled ? "enabled" : "disabled");
  } catch { process.exit(1); }
' "$config_path") || {
  printf '%s\n' "Morpheus could not read a valid saved auto-update preference at $config_path. Inspect the file and runtime error; do not overwrite it or ask to enable updates again." >&2
  exit 1
}
case "$preference" in
  enabled)
    printf '%s\n' "Morpheus automatic updates are already enabled on this device, but the installed CLI could not start or lacks self-update support." "Honor the saved opt-in. Repair the tool PATH first; if the installation needs repair, run: sh .morpheus/bootstrap.sh enable" "Do not ask to enable updates again."
    exit 0
    ;;
  disabled)
    printf '%s\n' "Morpheus automatic updates are disabled on this device. The installed CLI could not start or lacks self-update support. Leave the saved choice unchanged; repair the tool PATH or request a manual update only when needed."
    exit 0
    ;;
esac

cat <<'MORPHEUS_BOOTSTRAP_REQUIRED'
Morpheus bootstrap required.
The installed Morpheus CLI is unavailable or predates version-independent self-update, and no saved auto-update preference was found.
Ask the user exactly: "Morpheus is stale. Enable automatic updates after pulls on this device?"
Do not infer consent.
If yes, run: sh .morpheus/bootstrap.sh enable
If no, run: sh .morpheus/bootstrap.sh disable
A yes installs current reviewed Morpheus main as a standalone global package, registers this project, and installs managed Git hooks. A no only records the choice.
MORPHEUS_BOOTSTRAP_REQUIRED
