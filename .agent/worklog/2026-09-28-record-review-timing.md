---
agent: codex
date: 2026-09-28
roadmap: MO-26-09-28-02.12.53
outcome: review
---

# Measure independent review time

Issue #281 documents a measurement defect: the packet asked a reviewer to estimate elapsed
minutes, and an estimate could trip a budget even when runner time was short. The author now
owns per-turn runner or clock measurement. New packets emit version 2, requiring a timing source,
integer milliseconds and audit evidence for the initial review and each follow-up. Conventions
checks the unrounded conversion to minutes; risk floors, ceilings, outcomes and escalation rules
stay unchanged. Historical version 1 records remain compatible and validate timing if supplied.

The packet forbids workload estimates and inferred transcript idle gaps. Tool execution/waits
belong to a reviewer turn; author work between turns does not. Evidence references stay local
and human-auditable, with no private transcript upload or claim that CI authenticates the source.
The runbook, architecture, repository instructions and project scaffold use the same contract.
No generic timing library is needed for this Zod/arithmetic record protocol.

Five new regressions failed before implementation. They cover the issue's 312615ms versus
40-minute estimate, initial/follow-up evidence (including the legacy followUp shape), version1
compatibility, exact budget/floor boundaries and invalid timing. An actual prepareReview test
checks emitted version2 and author-owned measurement instructions; scaffold assertions pin those
instructions in generated projects. Full1455tests, frozen install, typecheck, compile, index,
lint and inbox validation passed before current-main integration.

Graph search and coverage transport remain closed in the author session. Exact-checkout install
indexed successfully with existing client configuration ownership warnings; direct source reads
covered the checker, packet generator, prompt, scaffold and tests. No exhaustive graph claim.

The hosting conventions workflow uses reviewed main, so this PR's own attestation uses the
compatible version1 shape with actual measured timing documented in prose. After merge,
review prepare emits version2 for subsequent PRs. No bypass or temporary workflow pin is used.

Integrated reviewed PR296 (76b17df); regenerated the conflicted source map from TypeScript.
All 1,457 tests and typecheck/compile/index/lint/inbox validation pass on the integrated head.

Integrated reviewed Firebase PR238 as an exact Git merge before review. All1,488 tests,
typecheck, compile, PM index, lint and inbox validation passed on the reviewed head.

## Independent review

Independent reviewer /root/review_timing281 cleared the exact current remote head at high risk with no findings. It verified the timing schema/checker, both follow-up shapes, historical version1 compatibility, unchanged budgets, packet generation, generated instructions and documentation. All154 focused local-review/init tests passed; direct source inspection covered stale graph metadata and excluded generated files. No follow-up or disagreement.

Runner evidence: reviewer thread `01a0e757-6b73-7ed2-93c6-0c5147ddf953`, turn
`01a0e757-6c04-7410-bd36-6d6a884c3a96`, `durationMs=170484` from the completed
`wait_threads` response. The unrounded conversion is `170484 / 60000 = 2.8414` minutes.
This measures the complete runner turn, not the reviewer's earlier final clock reading.

```morpheus-review
{
  "version": 1,
  "base": "1444d323444e9ac70692f8ec6bab428e754c5065",
  "reviewed": "7be9651225129e8c09d149630952cee888e543f0",
  "covered": "7be9651225129e8c09d149630952cee888e543f0",
  "authorSession": "01a0e740-1916-74d2-84ea-59d230b51620",
  "reviewerSession": "/root/review_timing281",
  "risk": "high",
  "elapsedMinutes": 2.8414,
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_timing281 cleared the exact current remote head at high risk with no findings. It verified the timing schema/checker, both follow-up shapes, historical version1 compatibility, unchanged budgets, packet generation, generated instructions and documentation. All154 focused local-review/init tests passed; direct source inspection covered stale graph metadata and excluded generated files. No follow-up or disagreement.",
  "findings": []
}
```
