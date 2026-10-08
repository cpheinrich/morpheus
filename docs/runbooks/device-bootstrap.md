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
Morpheus's global CLI is a self-contained copy, never a link to a source checkout or worktree.
`morpheus self check` compares its commit receipt to current `main`; `context brief` and `doctor`
surface the same drift. `morpheus self update` is the one-time/manual repair; consented Git hooks
call `morpheus self ensure` after later pulls and rebases. Both build in a disposable clone, install
the copy, and remove the clone without touching active work. The codebase-memory version stays
pinned until a reviewed Morpheus change advances it.
