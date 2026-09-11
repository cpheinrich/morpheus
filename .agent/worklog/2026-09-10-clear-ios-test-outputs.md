---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.39.21
outcome: review
---

# Clear persistent iOS run outputs

Issues #217 and #232 describe the same resultBundlePath failure after cancellation on a
self-hosted runner. The workflow now removes only Results, Logs and Screenshots before
recreating them. SourcePackages, DerivedData and unrelated runner files remain intact.
This also prevents old screenshots/logs from appearing as evidence for the next attempt.

## Validation

- The new test executes the actual preparation shell on a fresh temporary runner, then twice
  with partial Build.xcresult/Tests.xcresult, old logs and old screenshots. It verifies empty
  output directories, surviving caches, unaffected sibling files and every exported path.
- Before the fix the test failed with both stale bundles still in Results; after the fix it passes.
- pnpm typecheck, all 1,145 tests, pnpm compile and pnpm morpheus pm index passed.
- No local full iOS suite: this changes output preparation, so the executable filesystem
  reproduction targets the failure directly without recompiling an unrelated consumer app.
- Graph tools became unavailable after the required exact-worktree bootstrap reported local
  configuration ownership conflicts. Direct workflow/test source inspection supplied evidence.

## Independent review

Pending the fresh bounded reviewer session after trunk integration.
