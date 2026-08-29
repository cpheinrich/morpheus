#!/bin/sh
# morpheus:bootstrap:v1
set -eu

action="${1:-}"
if [ "$action" != "enable" ] && [ "$action" != "disable" ]; then
  printf "%s\n" "Usage: sh .morpheus/bootstrap.sh enable|disable" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
project_root=$(CDPATH= cd -P "$script_dir/.." && pwd)
config_path="${MORPHEUS_AUTO_UPDATE_CONFIG:-${HOME:?HOME is required}/.morpheus/auto-update.json}"

if [ "$action" = "disable" ]; then
  changed_at=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
  config_dir=$(dirname "$config_path")
  config_tmp="${config_path}.tmp.$$"
  umask 077
  mkdir -p "$config_dir"
  trap 'rm -f "$config_tmp"' EXIT HUP INT TERM
  printf '{\n  "schema": 1,\n  "enabled": false,\n  "changedAt": "%s"\n}\n' "$changed_at" > "$config_tmp"
  mv "$config_tmp" "$config_path"
  trap - EXIT HUP INT TERM
  printf "%s\n" "Morpheus automatic updates are disabled on this device."
  exit 0
fi

for required in git node npm; do
  if ! command -v "$required" >/dev/null 2>&1; then
    printf "%s\n" "Morpheus bootstrap requires $required on PATH." >&2
    exit 1
  fi
done

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 22 ]; then
  printf "%s\n" "Morpheus requires Node 22 or newer; found Node $node_major." >&2
  exit 1
fi

temp_parent=$(mktemp -d "${TMPDIR:-/tmp}/morpheus-bootstrap.XXXXXX")
trap 'rm -rf "$temp_parent"' EXIT HUP INT TERM
clone="$temp_parent/morpheus"

if ! command -v pnpm >/dev/null 2>&1; then
  if ! command -v corepack >/dev/null 2>&1; then
    printf "%s\n" "Morpheus bootstrap requires pnpm or corepack on PATH." >&2
    exit 1
  fi
  mkdir -p "$temp_parent/bin"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$temp_parent/bin/pnpm"
  chmod 700 "$temp_parent/bin/pnpm"
  PATH="$temp_parent/bin:$PATH"
  export PATH
fi

git clone --depth 1 --branch main --single-branch \
  https://github.com/cpheinrich/morpheus.git "$clone"
if [ ! -f "$clone/dist/cli/index.js" ]; then
  printf "%s\n" "Current Morpheus main did not contain the committed CLI." >&2
  exit 1
fi

(
  cd "$clone"
  node dist/cli/index.js self install
)
npm_prefix=$(npm prefix --global)
PATH="$npm_prefix/bin:$PATH"
export PATH
(
  cd "$project_root"
  node "$clone/dist/cli/index.js" registry add
  node "$clone/dist/cli/index.js" self auto-update enable
)

printf "%s\n" "Installed current Morpheus and enabled automatic updates on this device."
