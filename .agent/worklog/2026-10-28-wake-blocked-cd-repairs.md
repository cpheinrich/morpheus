---
date: 2026-10-28
agent: codex
roadmap: MO-26-10-28-13.49.13
tags: [engineering, devops]
outcome: complete
summary: Bound repeated unchanged blocked repair analysis while preserving immediate changed-evidence wake and an eventual recheck.
---

# Wake blocked CD repairs on changed evidence

The live Evo staging repair reached 285 invocations while repeating the same missing review capability. Renewed checkpoints and timer clocks did not advance delivery. Chris explicitly asked to fix every audited failure mode and validate a new TestFlight build. PR536 already repaired admission diagnostics and PR538 repaired ordinary queue fairness; this change bounds repeated blocked analysis in their existing worker.

After two strategies, a completed blocked invocation with a concrete missing capability may wait six hours when its frozen context is unchanged. New task evidence or relevant delivery source/attempt, workflow-terminal or executor-quiescence facts wake it immediately, including past a deferred next-check clock. At exactly six hours it retries normal admission. A wait consumes no quota/login/model call or hosted Actions lookup and cannot hide another runnable ordinary repair. New evidence requests analysis; it supplies no missing human authorization.

The normal invocation-start transition receipt binds the exact work, task, invocation and fence to a versioned digest of the context actually placed in the prompt before admission. CAS retries retain that frozen digest so concurrent new evidence is not swallowed. Legacy or malformed receipts establish a baseline through normal admission. A dispatch-only hosted placeholder cannot erase the prior actual blocked invocation. Existing immutable-task, lease, pause, executor reservation, quota, session and uncertain-effect controls remain.

Build versus borrow: this is a small CD-specific predicate over the existing canonical hash and opaque transition receipt. No generic scheduler, retry framework, dependency, schema migration or persistent cursor is added.

## Validation and retained history

The first unchanged-source regression failed by assertion because it launched another synthetic invocation. The first implementation passed 139 focused worker/control tests, zero skips, typecheck and whitespace checks. Three temporary mutants were killed by assertions: always-ready admission, strict greater-than at the six-hour boundary, and replacing frozen input with the current CAS context. Every source restoration matched its original hash. One intermediate multi-session output was truncated; that outcome remains unclassified and was not counted as validation.

Root source inspection found a material omission before review: new executor quiescence or workflow-terminal evidence could leave an active delivery attempt's identity/status unchanged. Both added regressions first failed on that source, then the exact evidence fields were added to the frozen context. Final focused results and independent review are recorded below when complete.

Root compiled the initial revision and regenerated PM indexes successfully; generated output is regenerated again after the evidence-context correction. The full suite is delegated to required CI; no unchanged full local suite was rerun. Source completion is separate from the Evo consumer binding, actual worker adoption, observed recovery and exact installable TestFlight receipt.

Final corrected validation: `pnpm exec vitest run tests/cd/native-worker.test.ts tests/cd/worker.test.ts tests/cd/repair-control.test.ts` passed 141 tests with zero skips (54.88 seconds); `pnpm typecheck` and `git diff --check` exited0. The three selected mutants were rerun against the corrected source and failed by assertion (2 failures; 1 failure/2 passes; 2 failures), then restored byte-for-byte to worker SHA256 `db98b67d628a006820d991c9f29df3d1ccbae26f60d1c60fb4ed0b22e94f146f`. Root retains the original and corrected mutant logs privately.

Before initial independent review, Root integrated protected trunk322d6746 (meeting notices). Only the append-only decisions file conflicted; the full common base and both complete appended decisions were retained. The integrated source and generated output are included in the initial review packet; no CD implementation conflict occurred.

## Independent review

The fresh high-risk independent review cleared the exact integrated implementation with no findings or conditions; 141 independent focused tests passed with zero skips.

```morpheus-review
{
  "version": 2,
  "base": "322d6746e1817f5de0837ad7494479f7ad215656",
  "reviewed": "0276be6c74b4184a85bcb800fe9de512fc98fff0",
  "covered": "0276be6c74b4184a85bcb800fe9de512fc98fff0",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/blocked_capability_wake_independent_review_2116",
  "risk": "high",
  "elapsedMinutes": 3.45,
  "timing": {
    "source": "clock",
    "durationMs": 207000,
    "evidence": "Root clock immediately before reviewer invocation2026-10-28T21:16:19Z; reviewer final actual clock2026-10-28T21:19:46Z. Runner-issued reviewer /root/blocked_capability_wake_independent_review_2116 under parent01a1572f-2ae1-77f2-be54-4265b3baca43. Report write and later Root receipt are distinct."
  },
  "outcome": "complete",
  "summary": "The fresh high-risk independent review cleared the exact integrated implementation with no findings or conditions; 141 independent focused tests passed with zero skips.",
  "findings": [],
  "trunkIntegrations": [
    {
      "commit": "9668d45b0e9ca65b4b92483b5099e7967c41a982",
      "reason": "Integrate protected trunk0887908f after review. Retained common base and both full appended decisions; regenerated the conflicting worker source map from the mechanically combined TypeScript. Incoming worker change prints the review-floor waiver and came through protected543. No capability-wait logic conflict; integrated354 focused worker/control/repair-check/local-review tests, typecheck and compile passed."
    }
  ]
}
```

After clearance, protected main advanced to0887908f. The normal merge refused the conflicting branch; Root integrated it under the runbook trunk-integration rule, preserving both decision appends and regenerating the source-map conflict. `pnpm typecheck`, `pnpm compile` and 354 focused tests across native-worker/worker/repair-control/repair-checks/local-review passed, zero skips. The incoming change prints the trivial-review floor waiver; it does not change the new wait predicate. The named merge preserves the original reviewer, timing, coverage and findings history.

GitHub also returned one non-test changes check as in_progress despite success, completed_at and every step completed. That contradictory provider result and the original wait remain preserved privately, not relabeled as completed output. Required exact-head checks were independently green; the protected non-admin merge path remained authoritative and exposed the genuine trunk conflict. No workflow was cancelled or rerun. New integrated-head CI is required before merge.
