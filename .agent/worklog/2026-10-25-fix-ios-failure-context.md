---
roadmap: MO-26-10-25-05.37.37
tags: [engineering, devops, infrastructure, ios]
---
# Validate iOS workflow failure expression contexts

## Mandate and source boundary

The coordinating owner delegated the narrow shared-workflow correction with
local source preparation authorized and initial implementation publication,
source-CI spend and reviewer invocation held pending inspection of the complete
qualified packet. The normal task claim is authorized. Private incident/provider
evidence and the owner's finite budget ledger stay outside public history.
No native dispatch, host/service/runner action, consumer adoption or controller
history mutation belongs to this task. Source completion does not attest delivery.

## Requirements and design

The native workflow must validate in real Actions expression contexts, snapshot
failure before artifact writers, preserve exact-true diagnostic selection, and
keep the complete artifact admission barrier. Success, tolerated
continue-on-error, skipped work, cancellation before capture and scope bypass
must not select failure diagnostics. Failure captured before a later artifact
failure or cancellation stays captured.

The smallest supported form is a step conditional containing `failure()` and a
literal `failed=true` output. A skipped capture has no output. The existing
stage/upload comparisons accept only true and need no behavioral relaxation.

The defect class is guarded by real actionlint, not a custom syntax emulator:
version 1.7.12, published 2026-03-30, official checksummed Linux X64 archive in
the existing required Node check. The optional reusable input defaults false;
Morpheus enables it. Tool acquisition has a 90-second download limit and
three-minute step timeout. No new job, cache, artifact or model call is added.
The tool remains available to the subsequent actual-checker regression tests.

## Investigation and actual validation

- Installed actionlint 1.7.12 rejected the original source at the step environment
  expression, with `calling function "failure" is not allowed here`.
- GitHub's [context availability table](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
  permits status functions in step `if`, and omits them from step `env` and `run`.
  The [runner implementation](https://github.com/actions/runner/blob/main/src/Runner.Worker/Expressions/FailureFunction.cs)
  uses job status for a normal workflow step; raw failed outcomes hidden by
  continue-on-error are not a failed job.
- Codebase graph verification used primary project
  `Users-chrisheinrich-code-morpheus`, generation `2026-10-25T12:36:57Z`.
  Relevant pre-existing paths reported metadata-match/no-recorded-issue, a
  best-effort signal only. The new test path was missing from that primary index;
  its exact local source was read instead. YAML configuration, expressions and
  documentation were read directly, with literal search for consumers.
- Focused command: `pnpm exec vitest run tests/workflow-expressions.test.ts tests/artifact-workflows.test.ts tests/workflows.test.ts tests/ci-scope.test.ts`.
  The initial local run passed 215 tests across four files. This covers the
  changed workflow contexts, actual native capture script, all-selected barrier,
  uploader admission/retention/pins, reusable callers and direct CI scope.
- `pnpm typecheck` passed. `actionlint -shellcheck= -pyflakes=` passed across
  all shipped workflows. Rechecking committed pre-fix iOS source through the
  same real checker rejected the original defect again.
- After expanding cancellation-state modeling, the final focused command also
  included `tests/lint-contract.test.ts`: 217 tests passed across five files.
  Typecheck passed again on those final tests. `pnpm compile` passed and
  `pnpm morpheus pm index` changed no generated files.
- Five deliberate local source mutants all failed the relevant assertion:
  replacing failure with always, removing scope, writing false, moving capture
  after the first artifact stage, and dropping complete-evidence's barrier
  guard. The workflow was restored exactly afterward. Separately, the committed
  real-checker tests reject twelve sibling status-function/context mutants.
- Downloaded the exact official Linux X64 release archive locally; its SHA-256
  matched the pinned `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.
  The Darwin ARM64 checker executed locally. Executing the Linux binary and the
  CI acquisition step awaits the actual authorized Linux Node job.

No local full-suite run was made: the changes are workflows, focused tests and
prose, outside the shared-core paths that permit one local full run. Full CI is
still required. No new package or generated runtime source changed.

## Limitations and next action

Local state/output scenarios model documented Actions status semantics and run
the actual capture shell; they are not native Actions runtime evidence. No
source CI, review, protected merge, consumer pin or real delivery is claimed.
The owner must inspect the complete local packet and CI event/cost shape before
releasing initial implementation publication. After release, one fresh high-risk
reviewer, normal record validation, final-head CI and protected merge are required.

## Protected integration and source publication release

The coordinating owner released the finite source publication/review/CI/merge loop
after inspecting the initial packet, conditional on the actual protected verifier
merge. [PR511](https://github.com/cpheinrich/morpheus/pull/511) merged as
`5fbdee441c71e5634c2f14b28babbab8d25820b2`; the task fetched and merged that
actual current trunk before its first implementation publication.

The only merge conflict was two independent append-only decision entries. Resolve
it mechanically by retaining the entire incoming decisions file as a byte-exact
prefix and appending this task's exact existing decision block. Every other
incoming changed path and all three authored workflow files remained byte-exact.
No code/configuration conflict or semantic resolution occurred. The initial
independent review includes this complete integrated result.

The release covers only this narrow source loop. Native execution, consumer
adoption, host/service/runner effects, provider operations and controller history
remain outside its authority.

The integrated source passed the same 217 focused tests across five files,
typecheck, compile, real actionlint over the actual complete workflow set,
PM index/validation and whitespace checks. No generated changes resulted.
The protected verifier merge's natural main CI also completed successfully before
the initial independent review; initial task CI remains the next qualification.

## Initial CI and independent review

[Initial CI](https://github.com/cpheinrich/morpheus/actions/runs/40196537410)
passed at `dcca49c71afc3e67f1fb5887e8f814068bc766e3`: six checks passed and
three expected unlabelled-draft/legacy-review checks skipped. The actual Linux
actionlint 1.7.12 acquisition and validation passed in the required Node job;
112 test files and 3,198 tests passed. Browser QA and the actual artifact ABI job
passed. No local full-suite rerun was added.

Independent high-risk review cleared the workflow correction with no findings after checking supported status semantics, unchanged native controls, real actionlint regressions and actual Linux CI evidence. No fixes or follow-up review were required; native delivery and consumer adoption remain unverified by this source task.

The one fresh reviewer independently ran 14 targeted tests and rejected both
the original defect and the twelve unsupported-context mutants with real
actionlint. The author measured actual clock readings around the invocation:
13:18:35–13:21:20 UTC on 2026-10-25, 165,000 ms, with no delay to meet the floor.

After clearance, integrate protected current trunk
`a719fd1051c18d46cc0c048172a9761dad1c0e36` mechanically. The merge
`b3ec43f54a12a39648b04c14681acd13b57c272b` has exactly the tree independently
calculated by `git merge-tree --write-tree`: `05c94c43774f5486fcd0ff5f2b1e02451711bb65`.
This clean post-review integration spends no review turn; final CI remains required.

```morpheus-review
{
  "version": 2,
  "base": "5fbdee441c71e5634c2f14b28babbab8d25820b2",
  "reviewed": "dcca49c71afc3e67f1fb5887e8f814068bc766e3",
  "covered": "dcca49c71afc3e67f1fb5887e8f814068bc766e3",
  "authorSession": "01a17310-1e80-7fe1-b0ea-e5c454d9f2fc",
  "reviewerSession": "/root/native_artifact_workflow_expression_fix/workflow_high_review",
  "risk": "high",
  "elapsedMinutes": 2.75,
  "timing": {
    "source": "clock",
    "durationMs": 165000,
    "evidence": "Author clock tool readings around reviewer /root/native_artifact_workflow_expression_fix/workflow_high_review: 2026-10-25T13:18:35Z before dispatch and 2026-10-25T13:21:20Z immediately after its final result."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the workflow correction with no findings after checking supported status semantics, unchanged native controls, real actionlint regressions and actual Linux CI evidence. No fixes or follow-up review were required; native delivery and consumer adoption remain unverified by this source task.",
  "findings": []
}
```
