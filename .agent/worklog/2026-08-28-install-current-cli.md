---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-12.34.11
outcome: review
---

# Make the installed CLI self-contained and freshness-aware

## What changed

- Replaced the documented `npm link` distribution path with an explicit standalone package install.
- Added `morpheus self check`, `self install`, and `self update`. Installation accepts only clean
  exact current main, verifies committed `dist/`, records the installed commit, and refuses a
  symlinked package directory. Update performs the install through a disposable clone and removes it.
- Added the same bounded freshness signal to session start, doctor, and codebase-memory status.
- Updated generated device instructions, the architecture, README, and the superseded distribution
  decision.

## What the audit found

Issues #111, #121, and #166 are one defect: the globally installed tool had no provenance or
freshness contract. The local `morpheus-runtime` directory was a consequence of protecting dirty
work while using `npm link`: the clean temporary worktree became the package target and therefore
could not be deleted without breaking the CLI.

The first standalone package installed during the audit exposed a second form of the same defect.
The old check ran Git inside the package directory without proving that directory was the repository
root, so Homebrew's ancestor repository was reported as Morpheus source. The new check requires exact
real paths and tests this case directly.

The first package smoke also hit a root-owned legacy file in the machine's normal npm cache. The
installer now uses a cache inside its own disposable directory for both pack and global install, so
updating Morpheus neither depends on nor modifies that broken shared cache.

## Verification

- Baseline before edits: 32 test files and 979 tests passed; typecheck, compiled artifact check, PM
  validation, and team validation passed.
- Focused implementation suite: 5 test files and 138 tests passed.
- Self-install tests cover current/stale receipts, missing provenance, ancestor repositories, dirty
  and ahead checkouts, copied installation, receipt writing, and disposable-clone cleanup.
- Final source verification: 33 test files and 987 tests passed; TypeScript typecheck, PM indexing
  and validation, team validation, and `git diff --check` passed.
- `npm pack --dry-run --json` succeeded through an isolated cache and included both self command
  entry points in the package.

The `pnpm` script wrapper stalled silently in this restricted execution sandbox, while its exact
underlying local binaries completed normally. Verification therefore used
`node_modules/.bin/tsc`, `node_modules/.bin/vitest`, and the compiled `dist/cli/index.js`; no hung
wrapper invocation is counted as a result.
