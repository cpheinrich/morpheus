---
agent: codex
date: 2026-10-06
roadmap: MO-26-10-06-18.31.32
outcome: review
---

# Isolate required PR check concurrency

The live Morpheus Security PR #340 had green current checks but remained blocked by a cancelled
required `CI / pr / conventions` job. The reusable conventions workflow grouped jobs only by
PR ref. `CI` and `Review metadata` therefore cancelled each other when metadata changed.
The group now includes the caller workflow and retains same-caller cancellation. The workflow
test pins that group, and the independent-review runbook explains why it matters.

The item was claimed in an isolated worktree. Claim reconciliation also marked four unrelated
roadmap items shipped; those incidental changes were restored to the current trunk state.

Before PR: frozen install, typecheck, all 1,693 tests in 60 files, compile, PM index, and
`git diff --check` passed. Generated indexes were unchanged.
