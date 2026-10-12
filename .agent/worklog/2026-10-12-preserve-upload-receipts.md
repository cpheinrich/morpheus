---
roadmap: MO-26-10-12-12.03.33
---
# Preserve TestFlight upload acceptance

Issue #299 reproduced in the current action: `builds upload`, processing, beta groups and
beta review shared one failing shell step. Apple transport acceptance was lost as independent
evidence when a later operation failed.

Separated acceptance from distribution. A create-only, fsynced JSON receipt contains an
allowlist of release and GitHub identity fields. The existing pinned official artifact action
persists that one file before any processing/distribution work. Names distinguish runs,
attempts and invocations; no overwrite or raw API response. No receipt remains uncertain,
including cancellation between Apple acceptance and artifact persistence. Retention is 90 days.
The signing lock and cleanup stay around archive/export/upload; distribution receives only ASC
credentials and cleans its own temporary key. No scheduler adoption or release activation.

This is a domain-specific receipt contract using Python standard library and the existing
pinned actions/upload-artifact, with no generic storage module or package dependency.

Validation: frozen-lockfile install; pnpm typecheck; pnpm compile; pnpm morpheus pm index;
pnpm lint; pnpm morpheus inbox validate; bash -n on all three shell scripts;
pnpm exec vitest run tests/upload-receipt.test.ts tests/workflows.test.ts tests/signing-lock.test.ts
(159 tests). The receipt test executes seven Python cases, including the real upload boundary
and distribution script with a synthetic ASC CLI: no acceptance before upload, ambiguous responses,
exact allowlisted fields, create-only writes, failed retries, processing failure, and group failure.
The initial receipt tests failed on the missing implementation; the first integration run exposed
two existing tests still reading the moved beta-review code, corrected to its new script.
The full pnpm test run passed all 2,106 tests across 75 files (63.97 seconds).

No real Apple upload, signing material, production deployment, or beta distribution was used.
Graph-first discovery used current primary generation 2026-10-12T19:01:36Z and clean recorded
coverage for the original action/tests. Worktree bootstrap succeeded with configuration ownership
warnings; the active MCP transport then closed, so new files and moved code were read directly.
