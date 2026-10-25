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

Full validation: `pnpm test` passed 3,085 tests in 108 files (68.07 seconds), including all 19 cleanup/prune tests. This was the single full local suite run, justified by the shared `src/pm` change and explicit acceptance. No failures.

## Independent review response

Initial review of 7a64366727108e17452f23a5e7632fc1ca4e10bd by /root/prune_review found substantive R1: non-forced `git worktree remove` can delete a checkout restored after the absence check, including ignored private data. Accepted. The implementation now resolves the exact administrative directory by its `gitdir` pointer under the caller's canonical common Git directory, preserves existing/locked paths, and deletes registration metadata only. It never passes a checkout path to a deleting operation. Concurrent restoration can need registration repair, but its files and branch remain intact.

Added a deterministic test restoring the checkout immediately before the mutation, after all absence checks; it asserts exact ignored data and tracked file contents plus local and remote branch SHAs. The test initially needed an ESM filesystem module mock to inject the mutation boundary; the first spy-only attempt failed before exercising behavior. On the reviewed implementation it fails because private.txt is deleted; on the corrected implementation it passes. Follow-up review will cover this correction, generated output, tests and documentation.
