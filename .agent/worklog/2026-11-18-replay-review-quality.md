---
date: 2026-11-18
agent: codex
roadmap: MO-26-11-18-00.41.23
tags: [engineering, research]
---

# Replay review quality and avoidable work

The original audit author continued the work with the original audit reviewer as historical
evidence assessor and masked grader. Used the authorized Factory Claude gateway for fresh replay
sessions. The task worktree was claimed before implementation. Other projects were read-only.

The [report](../../qa/audits/2026-11-18-review-replay.md) gives the 50/50 corpus, causal
historical evidence and ranked experiments. Both arms caught the same six defects and made the
same redundant request once per repeat. The frozen reduced cases showed a ceiling.
Original-diff checks found two missed Git mechanisms, a suggestion to drop early target resolution, and
one attempt to block on evidence only obtainable after merge. This led to two scoped fixes.
The wider prompt remains an experiment fixture. The runbook records how to check requested
work against a supported path and avoid repeated minor notes.

A first Factory queue attempt for the fourth original-diff review could not start alongside
three active sessions. Retried after another session finished. All four produced review text.
One P02 review returned incomplete. One P01 review's structured wrapper summarized away the
requested shape; the original JSON finding list was recovered from its worker events. The
graph installer enabled watching but reported a desktop config ownership warning and stopped
before indexing the task. Direct indexing and exact coverage checks then succeeded.

The scorer tests paired outcomes with equal totals and opposite individual effects, and verifies
missing output stays unknown. The primary score reproduces both repeats from committed labels.
A disposable reconstruction reproduced the tested candidate SHA-256. The CLI regression exercises
a real Git checkout with a missing trusted ref, a same-named tag, and a candidate opting out of
review. Removing early lookup alone changed the diagnostic, but downstream checks still refused.
Replacing exact lookup at CLI entry with permissive revision lookup yielded a false waiver and
exit 0. The restored implementation returned 1 with the expected diagnostic.

The private ledger and raw Factory receipts are retained in the controller's task artifacts.
The raw graded output is hashed in the report. The benchmark cost listed there excludes the
separate review of this draft. No provider or review runs are required to score the saved results.

## Independent review

Independent Factory review confirmed both paired-score repeats, the candidate patch digest and the new CLI check. The reviewer conditionally cleared a one-line correction to an existing test. The condition passed on the covered commit, and the PR summary describes the author-side runbook guidance.

The reviewer used cited context reads and direct source inspection. The reviewer did not
separately open the context-core and test-quality records in the suggested packet. The test
failure and exact requested evidence were verified through the real Vitest suite.

```morpheus-review
{
  "version": 2,
  "base": "9c4c3e58539f75d0bcabc545bfa9df3346488c30",
  "reviewed": "ae263013cfc301c1709a4f49de112a66af0d2d97",
  "covered": "1ba6dc0ab0ec19fd08db81a0ac53dbe4b63cc240",
  "authorSession": "01a1e8ee-5131-7a11-bf34-a05e67fd8d67",
  "reviewerSession": "889fddbd-664c-460f-b9b2-fbcabb696b09",
  "risk": "normal",
  "elapsedMinutes": 4.128683333333333,
  "timing": {
    "source": "runner",
    "durationMs": 247721,
    "evidence": "Factory run 25c8dcdf-443e-475a-b705-8821ad194d93 worker result event duration_ms=247721."
  },
  "outcome": "complete",
  "summary": "Independent Factory review confirmed both paired-score repeats, the candidate patch digest and the new CLI check. The reviewer conditionally cleared a one-line correction to an existing test. The condition passed on the covered commit, and the PR summary describes the author-side runbook guidance.",
  "contextRead": [
    ".agent/worklog/2026-11-18-replay-review-quality.md",
    ".agent/worklog/2026-11-17-trust-review-base.md",
    "hq/product/roadmap/MO-26-11-18-00.41.23-replay-review-quality.md",
    "qa/acceptance/MO-26-11-18-00.41.23.md",
    "docs/runbooks/independent-review.md",
    "qa/audits/2026-11-18-review-replay.md",
    "qa/evals/review-replay/README.md"
  ],
  "findings": [
    {
      "id": "R742-F1",
      "severity": "substantive",
      "description": "An unrelated existing test used trustedRef outside its scope and failed with ReferenceError.",
      "paths": [
        "tests/local-review.test.ts"
      ],
      "disposition": "fixed",
      "response": "Restored the original literal in the existing test on the covered commit.",
      "condition": {
        "paths": [
          "tests/local-review.test.ts"
        ],
        "evidence": "Restore the original literal at line 148. Run pnpm exec vitest run tests/local-review.test.ts tests/agent-instructions.test.ts in full and record the passing result."
      },
      "conditionMet": "The fix diff changes only that expectation. The exact requested command passed 195 tests in two files at the covered commit. The broader focused run passed 217 tests."
    },
    {
      "id": "R742-F2",
      "severity": "minor",
      "description": "The runbook guidance on checking callers and closing settled notes is outside the local reviewer packet.",
      "paths": [
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "disputed",
      "response": "The PR summary now identifies those as author-side process guidance. The broader reviewer experiment is preserved as the offline patch, and the live prompt change covers governing authority."
    }
  ]
}
```
