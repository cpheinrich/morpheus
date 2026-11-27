#!/bin/bash
# Install and enroll an unattended macOS host with an existing tailnet tag.
# A tagged first login disables device-key expiry. --check only reads local state.
set -euo pipefail
export TAILSCALE_BE_CLI=1

die() { printf '%s\n' "$*" >&2; exit 1; }
usage() { printf '%s\n' 'Usage: setup-tailscale.sh --tag tag:NAME [--check] or setup-tailscale.sh --check' >&2; exit 2; }
tag=""
check=0
while (($#)); do
  case "$1" in
    --tag) [[ "${2:-}" =~ ^tag:[A-Za-z][A-Za-z0-9-]*$ ]] || usage; tag="$2"; shift 2 ;;
    --check) check=1; shift ;;
    *) usage ;;
  esac
done
[[ -n "$tag" || "$check" == 1 ]] || usage
[[ "$(uname -s)" == Darwin ]] || die "This installer supports macOS hosts."
command -v python3 >/dev/null || die "python3 is required to check Tailscale enrollment."

app_bin=/Applications/Tailscale.app/Contents/MacOS/Tailscale
find_tailscale() {
  if [[ -x "$app_bin" ]]; then printf '%s\n' "$app_bin"; else command -v tailscale; fi
}

if ! tailscale_bin=$(find_tailscale); then
  ((check == 0)) || die "Tailscale is not installed."
  command -v brew >/dev/null || die "Homebrew is required to install Tailscale."
  brew install --formula tailscale
  tailscale_bin=$(find_tailscale) || die "Tailscale CLI is unavailable after installation."
fi

daemon_status() { "$tailscale_bin" status --json 2>/dev/null; }
if ! status=$(daemon_status); then
  ((check == 0)) || die "Tailscale daemon is unavailable."
  [[ "$tailscale_bin" != "$app_bin" ]] || die "Start the existing Tailscale app and rerun."
  brew_bin=$(command -v brew) || die "Start the existing Tailscale daemon and rerun."
  "$brew_bin" list --formula tailscale >/dev/null 2>&1 || die "Start the existing Tailscale daemon and rerun."
  [[ "$tailscale_bin" == "$("$brew_bin" --prefix)/bin/tailscale" ]] || die "Start the existing Tailscale daemon and rerun."
  sudo "$brew_bin" services start tailscale
  for attempt in {1..10}; do
    if status=$(daemon_status); then break; fi
    sleep 1
  done
  [[ -n "$status" ]] || die "Tailscale daemon did not respond after startup."
fi

# An absent/null KeyExpiry on a running identified node means no expiry.
# Output only an enrollment state, so account, peer and authentication data stay local.
read_enrollment() {
  printf '%s\n' "$1" | python3 -c '
import json, sys
status = json.load(sys.stdin)
node = status.get("Self") or {}
if status.get("BackendState") == "Running" and node.get("ID"):
    if node.get("Expired") or node.get("KeyExpiry") is not None:
        print("expiring")
    elif sys.argv[1] in (node.get("Tags") or []):
        print("tagged")
    else:
        print("connected")
elif (status.get("BackendState") == "NeedsLogin" and status.get("HaveNodeKey") is False
      and not node.get("ID") and not status.get("CurrentTailnet")):
    print("enroll")
else:
    print("unavailable")
' "$tag"
}

enrollment=$(read_enrollment "$status") || die "Could not read Tailscale enrollment."
case "$enrollment" in
  tagged|connected)
    [[ "$enrollment" == tagged || -z "$tag" ]] ||
      die "The existing Tailscale device does not have the requested tag. Verify its access policy before changing its identity."
    printf '%s\n' 'Tailscale is running with device key expiry disabled.'
    exit 0 ;;
  expiring)
    die "The existing Tailscale device has key expiry enabled. Disable expiry for its device record, then rerun." ;;
  enroll)
    ((check == 0)) || die "Tailscale is not enrolled." ;;
  *)
    die "Could not verify Tailscale enrollment. Check the existing device before rerunning." ;;
esac

up_args=(up "--advertise-tags=$tag" --timeout=5m)
if [[ -n "${TAILSCALE_AUTH_KEY_FILE:-}" ]]; then
  auth_key_file="$TAILSCALE_AUTH_KEY_FILE"
  [[ "$auth_key_file" == /* && -f "$auth_key_file" && -r "$auth_key_file" && -s "$auth_key_file" ]] ||
    die "TAILSCALE_AUTH_KEY_FILE must be an absolute path to a readable one-time auth key file."
  up_args+=("--auth-key=file:$auth_key_file")
fi
if [[ "$tailscale_bin" == "$app_bin" ]]; then
  "$tailscale_bin" "${up_args[@]}"
else
  sudo "$tailscale_bin" "${up_args[@]}"
fi
status=$(daemon_status) || die "Could not read Tailscale status after enrollment."
[[ "$(read_enrollment "$status")" == tagged ]] ||
  die "Tailscale did not confirm the requested tag and disabled key expiry. Check the device before proceeding."
printf '%s\n' 'Tailscale enrolled with device key expiry disabled.'
