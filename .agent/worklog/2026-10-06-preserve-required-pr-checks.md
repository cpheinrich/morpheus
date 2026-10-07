---
agent: codex
date: 2026-10-06
roadmap: MO-26-10-06-23.32.49
outcome: review
---

# Preserve required PR check results

The post-#341 Morpheus Security candidate #346 had successful CI and metadata conventions
checks, yet GitHub still showed a later cancelled metadata run as a failing required check.
The culprit was the reusable job's remaining same-caller concurrency group. GitHub may cancel
an in-progress run, or replace a pending run even when `cancel-in-progress` is false.

The required conventions job now has no concurrency group. The workflow test guards the reusable
job and both callers against reintroducing cancellation. The runbook records why each required
check must finish. The earlier #341 change remains in history as the first, insufficient repair.

The item was claimed in a detached worktree. Claim reconciliation also changed two unrelated
roadmap statuses; those were restored to the trunk state before review. Frozen install,
typecheck, all 1,719 tests in 61 files, compile, PM index and `git diff --check` passed.
