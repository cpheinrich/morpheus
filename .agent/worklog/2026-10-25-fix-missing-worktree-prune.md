---
date: 2026-10-25
agent: codex
roadmap: MO-26-10-25-04.33.08
tags: [engineering, devops]
outcome: research
summary: Repair missing-worktree pruning while preserving live directories and branches.
---

## Implementation and evidence

The CLI called `worktreeStatus` before `pruneStaleWorktrees`. Inventory skips wholly absent paths correctly, but calls `checkoutIdentity` on surviving paths; a registered directory without `.git` reproduces the reported `git rev-parse --show-toplevel` / not-a-repository error. This fixture establishes the failing code path, not the exact historical filesystem state in Evo. Native global Git prune also removes registrations for surviving directories without `.git`, contrary to the documented missing-directory-only contract.

The prune action now skips full inventory, enumerates registrations from the caller, and uses non-forced Git removal for absent, unlocked paths only. No branch deletion or new dependency. This is a small correction to Morpheus-specific lifecycle policy using its existing Git adapter, not a new generic module.

Regression before implementation: `pnpm exec vitest run tests/worktree-cleanup.test.ts -t 'missing worktree registration pruning'` — 2 failed, 3 passed (13 unrelated tests skipped). The CLI reproduction emits the exact reported Git error; the preservation test shows global Git prune incorrectly drops a surviving directory registration. The first run also exposed fixture teardown assuming every surviving directory has `.git`; teardown now removes isolated fixture data before unregistering it.

Secondary branch-only cleanup remains unchanged. Its exact-PR proof is reusable, but roadmap validation, task session associations and mutation guards are currently bound to the worktree. A separate design should retain equivalent safety for merge and squash PRs, rather than treat an absent checkout as consent to delete branches.

Repository startup preserved a pre-existing documentation edit in WIP draft PR #507 under the required `context brief` routine; that edit is not part of this task. `pm claim` reconciled four already-merged roadmap items in its claim commit. No merge or auto-merge is authorized for this PR.

Focused validation after implementation: `pnpm exec vitest run tests/worktree-cleanup.test.ts` passed all 18 tests, then an additional live-dirty-checkout preservation regression was added and `pnpm exec vitest run tests/worktree-cleanup.test.ts -t 'missing worktree registration pruning'` passed all 6 pruning tests (13 unrelated cleanup cases skipped). `pnpm typecheck`, `pnpm lint`, `pnpm compile`, and `pnpm morpheus pm index` passed. Generated CLI/cleanup output is included.

Graph tooling was unavailable in the session. The required installer check verified the primary checkout, but repair for the task checkout stopped on existing agent configuration ownership warnings. No graph completeness is claimed; direct source inspection covers `src/cli/pm.ts`, `src/pm/cleanup.ts`, `src/session/worktrees.ts`, `src/session/start.ts`, and `src/session/tasks.ts`.
