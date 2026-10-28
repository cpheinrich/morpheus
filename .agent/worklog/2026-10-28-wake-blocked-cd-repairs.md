---
date: 2026-10-28
agent: codex
roadmap: MO-26-10-28-13.49.13
tags: [engineering, devops]
outcome: review
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
