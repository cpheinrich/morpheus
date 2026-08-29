export const MORPHEUS_BOOTSTRAP = ".morpheus/bootstrap.sh";
export const MORPHEUS_SESSION_START = ".morpheus/session-start.sh";
export const MORPHEUS_BOOTSTRAP_README = ".morpheus/README.md";

export const BOOTSTRAP_MARKER = "# morpheus:bootstrap:v1";
export const SESSION_START_MARKER = "# morpheus:session-start:v1";

const lines = (values: string[]): string => `${values.join("\n")}\n`;

/**
 * Bootstrap from committed current-main code rather than the installed CLI.
 *
 * The installed binary is precisely the thing this script cannot trust: a
 * device may predate the entire `self` command. The committed CLI in the
 * disposable clone performs the reviewed install, registry update and hook
 * installation after consent.
 */
export const bootstrapScript = (): string =>
  lines([
    "#!/bin/sh",
    BOOTSTRAP_MARKER,
    "set -eu",
    "",
    'action="${1:-}"',
    'if [ "$action" != "enable" ] && [ "$action" != "disable" ]; then',
    '  printf "%s\\n" "Usage: sh .morpheus/bootstrap.sh enable|disable" >&2',
    "  exit 2",
    "fi",
    "",
    'script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd)',
    'project_root=$(CDPATH= cd -P "$script_dir/.." && pwd)',
    'config_path="${MORPHEUS_AUTO_UPDATE_CONFIG:-${HOME:?HOME is required}/.morpheus/auto-update.json}"',
    "",
    'if [ "$action" = "disable" ]; then',
    '  changed_at=$(date -u "+%Y-%m-%dT%H:%M:%SZ")',
    '  config_dir=$(dirname "$config_path")',
    '  config_tmp="${config_path}.tmp.$$"',
    "  umask 077",
    '  mkdir -p "$config_dir"',
    '  trap \'rm -f "$config_tmp"\' EXIT HUP INT TERM',
    "  printf '{\\n  \"schema\": 1,\\n  \"enabled\": false,\\n  \"changedAt\": \"%s\"\\n}\\n' \"$changed_at\" > \"$config_tmp\"",
    '  mv "$config_tmp" "$config_path"',
    "  trap - EXIT HUP INT TERM",
    '  printf "%s\\n" "Morpheus automatic updates are disabled on this device."',
    "  exit 0",
    "fi",
    "",
    "for required in git node npm; do",
    '  if ! command -v "$required" >/dev/null 2>&1; then',
    '    printf "%s\\n" "Morpheus bootstrap requires $required on PATH." >&2',
    "    exit 1",
    "  fi",
    "done",
    "",
    "node_major=$(node -p 'process.versions.node.split(\".\")[0]')",
    'if [ "$node_major" -lt 22 ]; then',
    '  printf "%s\\n" "Morpheus requires Node 22 or newer; found Node $node_major." >&2',
    "  exit 1",
    "fi",
    "",
    'temp_parent=$(mktemp -d "${TMPDIR:-/tmp}/morpheus-bootstrap.XXXXXX")',
    'trap \'rm -rf "$temp_parent"\' EXIT HUP INT TERM',
    'clone="$temp_parent/morpheus"',
    "",
    "if ! command -v pnpm >/dev/null 2>&1; then",
    "  if ! command -v corepack >/dev/null 2>&1; then",
    '    printf "%s\\n" "Morpheus bootstrap requires pnpm or corepack on PATH." >&2',
    "    exit 1",
    "  fi",
    '  mkdir -p "$temp_parent/bin"',
    '  printf \'#!/bin/sh\\nexec corepack pnpm "$@"\\n\' > "$temp_parent/bin/pnpm"',
    '  chmod 700 "$temp_parent/bin/pnpm"',
    '  PATH="$temp_parent/bin:$PATH"',
    "  export PATH",
    "fi",
    "",
    "git clone --depth 1 --branch main --single-branch \\",
    '  https://github.com/cpheinrich/morpheus.git "$clone"',
    'if [ ! -f "$clone/dist/cli/index.js" ]; then',
    '  printf "%s\\n" "Current Morpheus main did not contain the committed CLI." >&2',
    "  exit 1",
    "fi",
    "",
    "(",
    '  cd "$clone"',
    "  pnpm install --frozen-lockfile",
    "  node dist/cli/index.js self install",
    ")",
    'npm_prefix=$(npm prefix --global)',
    'PATH="$npm_prefix/bin:$PATH"',
    "export PATH",
    "(",
    '  cd "$project_root"',
    '  node "$clone/dist/cli/index.js" registry add',
    '  node "$clone/dist/cli/index.js" self auto-update enable',
    ")",
    "",
    'printf "%s\\n" "Installed current Morpheus and enabled automatic updates on this device."',
  ]);

/**
 * Session hooks may execute this without consent because it only inspects the
 * CLI. Installation remains a separate command the agent runs after a yes.
 */
export const sessionStartScript = (): string =>
  lines([
    "#!/bin/sh",
    SESSION_START_MARKER,
    "set -u",
    "",
    "if command -v morpheus >/dev/null 2>&1; then",
    "  if morpheus self auto-update status >/dev/null 2>&1; then",
    "    exec morpheus context brief",
    "  fi",
    "fi",
    "",
    "cat <<'MORPHEUS_BOOTSTRAP_REQUIRED'",
    "Morpheus bootstrap required.",
    "The installed Morpheus CLI is absent or predates version-independent self-update.",
    "Ask the user exactly: \"Morpheus is stale. Enable automatic updates after pulls on this device?\"",
    "Do not infer consent.",
    "If yes, run: sh .morpheus/bootstrap.sh enable",
    "If no, run: sh .morpheus/bootstrap.sh disable",
    "A yes installs current reviewed Morpheus main as a standalone global package, registers this project, and installs managed Git hooks. A no only records the choice.",
    "MORPHEUS_BOOTSTRAP_REQUIRED",
  ]);

export const bootstrapReadme = (): string => `# Morpheus device bootstrap

These generated scripts bridge this repository's session hooks to the copied global Morpheus CLI.

- \`session-start.sh\` only inspects the installed CLI and emits the consent question when it is
  too old to update itself.
- \`bootstrap.sh enable\` runs only after an explicit yes. It clones reviewed Morpheus \`main\`
  into a disposable directory, installs its reviewed lockfile, invokes that clone's committed CLI
  directly, installs the current standalone package, registers this project, and enables the
  managed Git hooks.
- \`bootstrap.sh disable\` records no without installing anything.

The files are generated by Morpheus. Change their source upstream rather than editing local copies.
`;
