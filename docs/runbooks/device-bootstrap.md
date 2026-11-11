# Device bootstrap

**Read this when** the session-start shim reports Morpheus stale, bootstrap required, or automatic updates unconfigured, or before installing codebase-memory on a device.


The checked-in `.morpheus/session-start.sh` shim recovers common non-login tool paths and
diagnoses missing, old, or broken installations. Only when the device preference is absent
and startup reports automatic updates are unconfigured, ask the user exactly: **"Morpheus is stale. Enable automatic
updates after pulls on this device?"** Do not infer consent.

- If the shim reports **Morpheus bootstrap required**, yes means
  `sh .morpheus/bootstrap.sh enable`; no means `sh .morpheus/bootstrap.sh disable`.
- Otherwise yes means `morpheus self auto-update enable`; no means
  `morpheus self auto-update disable`.

A stale startup notice is not evidence that consent is missing. Check the saved device
preference first. Honor an existing enabled choice with the supported refresh/repair command;
never ask again because PATH, the runtime, or a managed hook failed. A disabled choice stays
disabled, and invalid preferences must be diagnosed rather than overwritten.

The legacy bootstrap never calls the installed `morpheus` binary. A yes clones reviewed current
`main`, installs that clone's reviewed lockfile, invokes its committed CLI directly, installs the
standalone package, registers the current project and installs the managed hooks. A no only records
the choice.

Consent installs managed `post-merge` and `post-rewrite` blocks in every registered Morpheus
project, beside rather than over any existing hook. Later pulls and rebases check the reviewed
Morpheus `main` commit and update through a disposable clone only when stale. Git deliberately does
not activate a hook delivered by the pull that contains it, so the checked-in session shim and
these instructions are the first-use bridge; no repository may silently turn consent on.

Before structural code discovery, run `morpheus codebase-memory install --check`. If it is not
operational, run `morpheus codebase-memory install` on the trusted device. The repair is
idempotent: it installs Morpheus's reviewed package pin when absent or at another version, configures supported local
agent clients, enables automatic indexing and watching, fully indexes this exact checkout, and
verifies the index against `HEAD`. A worktree needs its own exact-checkout index even when the main
clone is already indexed.

Installing codebase-memory is an explicit device action, never an npm lifecycle script or a
session-hook download.

Before a code change, run `morpheus complexity install --check` the same way, and
`morpheus complexity install` if it is not operational: the pinned Lizard commit plus hash-locked
wheels in a venv under `~/.morpheus/tools`, needing Python 3.9 or newer. Then run
`morpheus complexity check` after each changed function family; see [complexity](complexity.md).
Morpheus's global CLI is a self-contained copy, never a link to a source checkout or worktree.
`morpheus self check` compares its commit receipt to current `main`; `context brief` and `doctor`
surface the same drift. `morpheus self update` is the one-time/manual repair; consented Git hooks
call `morpheus self ensure` after later pulls and rebases. Both build in a disposable clone, install
the copy, and remove the clone without touching active work. The codebase-memory version stays
pinned until a reviewed Morpheus change advances it.

## Context search after an automatic update

The update installs the pinned Tantivy binding before replacing the CLI. Python 3.11+
with venv support and access to PyPI are needed for the first install. If that fails,
the old CLI remains in place. For a manual repair use `morpheus context runtime install`.

With auto-update enabled, the managed hooks register Morpheus Context MCP in the
local user's Codex and Cursor settings after updating or confirming
the CLI is current. Claude Code takes it from each project's `.mcp.json` instead,
so the hooks remove the user-level Claude entry Morpheus registered earlier. This applies to every Morpheus checkout the client launches,
including linked worktrees and clones missing portable project configuration.
Existing conflicting, disabled, unreadable or symlinked entries are preserved
and reported. The server requires a Morpheus manifest in the active checkout.

A legacy hook runs the old CLI throughout the first pull. The new build recognizes
the private, locked auto-update checkout at reviewed main and registers the stable
global executable before npm replaces its package. Registration is best effort.
If installation subsequently fails, the entry can remain pointed at the previous
CLI. Legacy hooks may suppress setup warnings. The next Morpheus session startup
retries registration and reports any conflict. Reload an already running client
so it discovers the new entry.
To reconcile immediately on an opted-in device, run `morpheus self ensure`.
