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

The independent reviewer conditionally cleared commit 790ae1ff4ccac3dd036791be2e99881ebcbafce0
at high risk. The reviewer found that architecture.md still required concurrency for every PR
gate. I updated only that specified policy paragraph, inspected its diff, and ran
`git diff --check`; commit 4017821210d25553bef13a01388c8b407ce00c70 carries the
conditioned correction. The reviewer found no other issue.

The independent reviewer conditionally cleared the required-check fix at high risk; the sole finding was a stale architecture rule, corrected in 4017821210d25553bef13a01388c8b407ce00c70 within the specified condition and verified by diff inspection and `git diff --check`.

```morpheus-review
{
  "version": 2,
  "base": "234746fe88923e7cb8ec3c8890441167bcce115f",
  "reviewed": "790ae1ff4ccac3dd036791be2e99881ebcbafce0",
  "covered": "4017821210d25553bef13a01388c8b407ce00c70",
  "authorSession": "01a113aa-c8cc-75e3-993c-cde4f0720b61",
  "reviewerSession": "/root/required_check_cancellation_review",
  "risk": "high",
  "elapsedMinutes": 1.12705,
  "timing": {
    "source": "clock",
    "durationMs": 67623,
    "evidence": "Date.now readings immediately before reviewer spawn 2026-10-07T06:37:22.125Z (1791355042125 ms) and immediately after completion notice 2026-10-07T06:38:29.748Z (1791355109748 ms); reviewer /root/required_check_cancellation_review."
  },
  "outcome": "complete",
  "summary": "The independent reviewer conditionally cleared the required-check fix at high risk; the sole finding was a stale architecture rule, corrected in 4017821210d25553bef13a01388c8b407ce00c70 within the specified condition and verified by diff inspection and `git diff --check`.",
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "architecture.md still directed maintainers to add cancellation groups to every required PR gate, which would reintroduce the merge-blocking failure.",
      "paths": ["architecture.md"],
      "disposition": "fixed",
      "response": "Exempted the required conventions job and both callers, and explained GitHub's pending-run replacement behavior.",
      "condition": {
        "paths": ["architecture.md"],
        "evidence": "Inspect the resulting architecture.md diff and run git diff --check."
      },
      "conditionMet": "Commit 4017821210d25553bef13a01388c8b407ce00c70 changed only architecture.md; its diff was inspected and git diff --check passed."
    }
  ]
}
```
