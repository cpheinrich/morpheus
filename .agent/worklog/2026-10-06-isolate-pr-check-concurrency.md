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

The first review attempt ended below Morpheus's one-minute floor and was not used as clearance.
Chris explicitly authorized a fresh independent review in this chat. The replacement reviewer
cleared commit `446a7bb62d4423e90910d61f942e85c93ecfe74b` at high risk with no findings.
The reviewer inspected both caller workflows, generated callers, the exact concurrency expression,
and GitHub's reusable-workflow context documentation; three focused workflow tests passed. The
reviewer made no changes. The merge from current main was automatic and preceded this review.

The fresh independent reviewer cleared commit 446a7bb62d4423e90910d61f942e85c93ecfe74b at high risk with no findings after inspecting both caller workflows, generated callers, the concurrency expression, official GitHub documentation, and focused tests.

```morpheus-review
{
  "version": 2,
  "base": "f167b7bfa88d21e8ab4cb244745293a7147ac855",
  "reviewed": "446a7bb62d4423e90910d61f942e85c93ecfe74b",
  "covered": "446a7bb62d4423e90910d61f942e85c93ecfe74b",
  "authorSession": "01a113aa-c8cc-75e3-993c-cde4f0720b61",
  "reviewerSession": "/root/pr341_replacement_review",
  "risk": "high",
  "elapsedMinutes": 1.1277,
  "timing": {
    "source": "clock",
    "durationMs": 67662,
    "evidence": "Date.now readings immediately before reviewer spawn 2026-10-07T06:23:25.975Z (1791354205975 ms) and immediately after completion notice 2026-10-07T06:24:33.637Z (1791354273637 ms); reviewer /root/pr341_replacement_review."
  },
  "outcome": "complete",
  "summary": "The fresh independent reviewer cleared commit 446a7bb62d4423e90910d61f942e85c93ecfe74b at high risk with no findings after inspecting both caller workflows, generated callers, the concurrency expression, official GitHub documentation, and focused tests.",
  "findings": []
}
```
