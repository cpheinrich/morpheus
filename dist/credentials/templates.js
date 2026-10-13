/** A new companion is private shell configuration, executed only by an explicit run. */
export function companionFiles() {
    return {
        "README.md": "# Private credentials companion\n\nLow-risk, rotatable local credentials only. Sensitive credentials belong in GSM.\nAccess is separate from access to consuming projects. Multiple projects may clone this repository.\nUse `morpheus credentials setup`, `sync`, `list`, `doctor`, and `run -- <trusted-command>` from the consuming project.\nValues in secrets/credentials.env are Bash assignments. Credential files also belong in secrets/.\nNever print values or copy them into a consuming repository. Commit and push intentional edits here; other clones need sync.\n",
        "AGENTS.md": "# Credentials handling\n\nNever open or print secrets/ files in an agent transcript. Use bin/credentials list for names, doctor for checks, and run -- <trusted-command> for injection. Child programs can disclose values: never run env, printenv, tracing, or header dumps. Credential possession grants no authority to spend, publish, deploy, or access unrelated data.\n",
        "secrets/credentials.env": "# Low-risk local credentials only. Bash KEY='value' assignments; no placeholders.\n",
        "bin/credentials": `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.dirname(path.dirname(fs.realpathSync(__filename)));
const file = path.join(root, 'secrets/credentials.env');
const [action, ...args] = process.argv.slice(2);
const die = () => { console.error('Credentials check failed; inspect setup without displaying values.'); process.exit(1); };
try {
  if (action === 'list') {
    for (const line of fs.readFileSync(file, 'utf8').split(/\\r?\\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      if (match) console.log(match[1] + '=<hidden>');
    }
  } else if (action === 'doctor') {
    const text = fs.readFileSync(file, 'utf8');
    if ((fs.statSync(file).mode & 0o077) || /REPLACE_ME/.test(text) || spawnSync('bash', ['-n', file], { stdio: 'ignore' }).status !== 0) die();
    console.log('Credentials syntax and file permissions checked.');
  } else if (action === 'run' && args[0] === '--' && args.length > 1) {
    const result = spawnSync('bash', ['-c', 'set -a; source "$1" >/dev/null 2>&1 || exit 1; set +a; shift; exec "$@"', 'credentials', file, ...args.slice(1)], { stdio: 'inherit', env: { ...process.env, MORPHEUS_SECRETS: path.join(root, 'secrets') } });
    process.exit(result.status ?? 1);
  } else die();
} catch { die(); }
`,
    };
}
export const credentialsInstructions = () => `## Local credentials companion

The optional [.morpheus/credentials.json](.morpheus/credentials.json) declares the private
credentials repository and relative local path. It is authoritative; do not guess locations.
Run \`morpheus credentials status\`. If the checkout is missing and the task needs credentials,
run \`morpheus credentials setup\` to clone the declared repository at the configured path,
then \`morpheus credentials doctor\`. Access to this project does not grant companion access;
report authentication/access failures without changing permissions or copying credentials.
Run \`morpheus credentials sync\` before declaring a credential missing; it updates only a clean
default branch and never resets edits. Use \`list\` for names and \`run -- <trusted-command>\` for
injection. Never open secret files, print values, dump the environment or enable shell tracing.
Read the companion's AGENTS.md before use. The child can print secrets; use trusted commands.
Sensitive credentials belong in GSM. Credentials do not authorize spending or external changes.
Paths resolve against the primary checkout, including from linked worktrees. A per-device
\`MORPHEUS_CREDENTIALS_REPO\` override may point to an existing shared checkout. Separate local
clones can reference the same remote. See Morpheus's local-credentials runbook for migration.
`;
//# sourceMappingURL=templates.js.map