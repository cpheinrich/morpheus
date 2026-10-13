---
roadmap: MO-26-09-14-10.08.45
date: 2026-09-14
agent: codex
---

# Isolate iOS job outputs

Issue #240 recurred after #235: cleanup succeeded at 15:02:58 in Evo job
104027322783, build-for-testing completed, and test-without-building rejected an
existing shared Tests.xcresult at 15:07:40. The complete failed-job log confirms the
shared path; the precise surviving child was not observable from those logs.
The reproduced failure mechanism is a late writer after preparation, independent
of whether it is Xcode or another process from the superseded job.

Each preparation now allocates a fresh mktemp directory labeled with run id and
attempt. Its unique suffix also distinguishes repeated invocations in one attempt.
Results, logs, screenshots and their artifact consumers use those paths. Evidence
collection requires successful preparation. SourcePackages and DerivedData keep
their existing cache paths. Preparation never deletes other invocations' outputs;
the runner owns its temporary-directory lifecycle. This also resolves incidental
IOSOUT-I1 from the previous triage run (uploading stale artifacts before preparation).

No package abstraction is needed: the macOS mktemp primitive owns atomic directory
allocation, with GitHub's documented run/attempt identifiers used only for labels.
[GitHub variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
and [cancellation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation)
describe these runtime boundaries. No runner cancellation policy or cache behavior changes.

## Validation

- The actual YAML preparation script is executed on a temporary filesystem. Old
  writers create both result bundles, logs and screenshots AFTER new preparation.
  The regression fails on the old workflow because its results directory contains
  the old bundles. It passes after isolation for new runs, reruns and a second job
  within one attempt, while asserting cache contents and unrelated files survive.
- Artifact paths are checked against the published preparation outputs; all four
  evidence steps require successful preparation, preventing empty-path fallback.
- Frozen install, all 131 workflow tests, all 1,320 repository tests, typecheck, compile,
  lint, PM index and inbox validation pass. Native iOS tests were not run locally:
  this changes workflow filesystem orchestration and does not change app code.
- A fresh exact-checkout graph was installed and verified at HEAD, but the current
  MCP transport closed after bootstrap. search_graph/check_index_coverage calls
  failed; direct source/YAML reads cover the changed workflow, tests and docs.
  No graph completeness claim is made. The device's previously enabled automatic
  CLI update was repaired to current reviewed main without touching shared source.

## Independent review

Independent high-risk review of 725cccbe01467d201dcb1fff387b087b6e52a0bc completed in 2.6 minutes with no findings. The reviewer confirmed the remote head, invocation isolation, stable caches, guarded artifact consumers and roadmap reconciliation; all 131 workflow tests and actionlint passed. No author fixes or follow-up were needed. Native Xcode cancellation was not reproduced; the executable filesystem regression covers late writes after preparation.

```morpheus-review
{
  "version": 1,
  "base": "5a096dcdd7559aa62c81c8da0241253da68040bd",
  "reviewed": "725cccbe01467d201dcb1fff387b087b6e52a0bc",
  "covered": "725cccbe01467d201dcb1fff387b087b6e52a0bc",
  "authorSession": "01a0a0ae-fedf-7352-ae5f-244b1b9a8f38",
  "reviewerSession": "/root/review_ios240",
  "risk": "high",
  "elapsedMinutes": 2.6,
  "outcome": "complete",
  "summary": "Independent high-risk review of 725cccbe01467d201dcb1fff387b087b6e52a0bc completed in 2.6 minutes with no findings. The reviewer confirmed the remote head, invocation isolation, stable caches, guarded artifact consumers and roadmap reconciliation; all 131 workflow tests and actionlint passed. No author fixes or follow-up were needed. Native Xcode cancellation was not reproduced; the executable filesystem regression covers late writes after preparation.",
  "findings": []
}
```

Actionlint 1.7.12 also passed against the changed reusable workflow.
