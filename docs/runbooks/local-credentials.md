# Local credentials companions

Projects may keep low-risk, rotatable local credentials in a separate **private** GitHub
repository. Sensitive secrets belong in Google Secret Manager. The companion is plaintext
including its Git history; it is not a vault or an agent sandbox. A trusted child can print values.

## Project contract

`.morpheus/credentials.json` is the only authoritative pointer:

```json
{
  "repository": "https://github.com/your-org/.credentials-project.git",
  "path": "local/.credentials-project",
  "command": "bin/credentials"
}
```

The consuming repository tracks this metadata only. `local/` must be ignored and untracked.
Paths are relative to the primary checkout, even from a nested directory or linked worktree.
Multiple projects can use the same repository URL with separate local clones. No symlink is
required. They synchronize through Git; a rotation needs a pull in each clone.

`MORPHEUS_CREDENTIALS_REPO` overrides the path for one machine (absolute or relative to the
primary checkout). A symlink to a shared checkout is also supported; both link and destination
are checked. Never commit an absolute machine path. Setup rejects a mismatched origin rather
than using credentials from another organization.

Access to the main project does **not** grant access to its companion. Contributors without
companion access can still work on credential-free tasks. Report missing access; do not make
it public, broaden permissions, or copy credentials into the main repository.

## New projects and existing stores

`morpheus init` scaffolds a pointer and agent instructions offline. It suggests the selected
owner and directory name; review the owner, URL and path before provisioning, especially for
organization projects. It creates no remote and never downloads credentials during startup.

For an existing project without a pointer:

```sh
morpheus credentials init https://github.com/your-org/.credentials-project.git
```

To use an existing private store, or recover a missing local clone:

```sh
morpheus credentials setup
morpheus credentials doctor
```

Setup verifies private visibility, clones if missing, checks the origin, restricts secrets/
permissions, and enables a companion's existing `.githooks` if present. It does not execute an
installer or replace a global launcher. Re-running preserves edits and does not pull. The local
wrapper is invoked directly, so two projects cannot accidentally use each other's PATH launcher.

For a **new** remote, explicitly run `morpheus credentials setup --create`. This creates the
private repository, clones it and commits/pushes a starter containing only instructions, a portable
Node/Bash wrapper and an empty env file. Existing remote names or local destinations are refused.
It requires GitHub repository-creation permission and a configured Git author. If interrupted,
inspect the created repository and clone before retrying; never delete them automatically.

Existing companions can declare `command: "bin/darwin-env"` or `"bin/lakina-env"` instead.
Their wrappers must implement `list`, `doctor`, and `run -- <command>` and protect values in
list/doctor output. Morpheus does not parse secret values. Wrapper compatibility is owned by the
companion; the supplied new-store wrapper requires Node 22+ and Bash on macOS/Linux.

## Daily agent use

```sh
morpheus credentials status
morpheus credentials sync
morpheus credentials list
morpheus credentials doctor
morpheus credentials run -- your-trusted-command
```

Status checks metadata only. If a task needs credentials and the clone is absent, run setup.
Sync requires a clean default branch and fast-forwards only. It never resets, stashes or prints
the diff. Resolve dirty/divergent/task branches separately; do not treat a stale clone as proof
that a credential is absent. Use `sync` before declaring a key missing.

Read the companion's AGENTS.md before use. Never open secret files, dump the environment,
enable shell tracing, or print authorization headers. Child flags (including `--help`) pass
through unchanged. Use a program that reads its own environment; outer-shell `$VARIABLE`
expansion happens before injection. Credential possession grants no authority to trade, deploy,
spend, publish, or access unrelated data. Existing project approval rules apply.

## Migration and collaborator prompt

Update Morpheus once with `morpheus self update` if it does not recognize `credentials`.
Existing automatic-update preferences are retained. An absent clone is automatically installed
by setup. Existing external clones are left untouched; use a device override to keep using one,
or allow setup to create the project-local copy. No secret copying or shared-directory move is
necessary. Legacy global launchers remain compatible, but use the project command for new work.

For a renamed remote, a reviewed pointer may list `legacyRepositories`. Setup changes an old
origin only when it is listed **and** GitHub reports the same repository ID for old and new URLs.
It never renames a remote repository. `legacyEnvironment` can list former path-override variable
names; the standard override takes precedence, including a deliberately invalid empty value.

Share this prompt after pulling the migration PR:

> Read this project's AGENTS.md and .morpheus/credentials.json. Ensure the installed Morpheus CLI
> supports credentials (use morpheus self update if needed; preserve automatic-update preferences).
> Run morpheus credentials setup, then doctor and sync. If setup is blocked by authentication or
> repository access, report that without changing permissions. Preserve all existing clones and
> uncommitted edits. Verify list shows names with values hidden, and verify the configured path is
> ignored and untracked. Do not open secret files, display values, or make provider API requests.
> Report the local path and any remaining migration issue.
