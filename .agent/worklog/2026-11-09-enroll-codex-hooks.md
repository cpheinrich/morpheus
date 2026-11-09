---
date: 2026-11-09
agent: codex
roadmap: MO-26-11-09-13.00.22
outcome: review
tags: [engineering]
summary: Added explicit per-project enrollment that approves future eligible Codex hook changes on macOS.
---

# Automatically approve committed hooks in enrolled projects

The requester clarified that approval should continue after the initial invocation. The
existing `approve` command remains one-shot. `enable` records the current Morpheus
checkout in the private Codex home and loads one login job for that home. The job checks
the enrolled checkouts once a minute and applies the same Git-source and hook-hash checks
as `approve`. A different checkout at the same path cannot inherit enrollment.
`disable` stops future approvals for the project and unloads the job when the last
project is removed. Codex keeps previously saved approval hashes.

A local timer handles committed changes regardless of how a project got to the new
checkout state. It also works when no Codex chat is open. The public repo does not
contain the enrolled projects or write a project-level opt-in file. Considered the
maintained `plist` package (two runtime dependencies). Used the macOS `plutil` already
available wherever the login job runs, so there is no new package dependency.

## Verification

- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and
  `morpheus complexity check` passed (CCN limit 15).
- `pnpm exec vitest run tests/codex-hooks.test.ts tests/doctor-codex-trust.test.ts`
  passed (37 tests). Coverage includes a new committed hook after enrollment, unchanged
  plugin approval state, disable, checkout replacement, and job startup failure.
- Ran the compiled CLI with the real macOS login job, two isolated Morpheus checkouts,
  and a temporary Codex home. The first project approved its initial hook on enable.
  After a new commit, the actual minute timer approved the new hook without another
  command, and the other checkout had no approvals. Disabling unloaded the job,
  preserved both saved approvals, and prevented approval of the next commit.
