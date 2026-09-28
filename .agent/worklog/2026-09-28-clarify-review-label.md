---
agent: codex
date: 2026-09-28
roadmap: MO-26-09-28-02.06.17
outcome: review
---

# Clarify missing independent-review label diagnostics

Issue #280 reproduced with both a complete and an incomplete committed review record: without
`agent-reviewed`, the checker returned the same instruction implying review was unfinished.
The early refusal now states the observed missing label, that record validation did not run,
and when to restore the label or keep it absent during pending corrections. Gate order and
acceptance are unchanged. No package is needed for this repository-specific diagnostic.

Two exact diagnostic regressions failed before the change. Frozen install, typecheck, all 1,451
Vitest tests, compilation, PM index, lint and inbox validation pass. Existing tests retain complete
record acceptance, incomplete-record refusal, stale coverage, conditional clearance and opt-out.
The runbook explains the separate label and record states.

Codebase-memory installation indexed this exact checkout but reported existing client config
ownership conflicts. The current MCP transport remains closed; graph search and coverage calls
failed. Direct source inspection covered checkLocalReview, its tests and the runbook. No graph
completeness is claimed.

Independent reviewer /root/review_label280 cleared the exact remote head with no findings at small risk. It independently checked the complete diff, caller and compiled output, and all 75 local-review tests passed. No author fixes or follow-up were needed. Graph coverage reported changed metadata and excluded generated output; direct source inspection covered those limitations.

Measured reviewer clock: 2026-09-28 09:11:07–09:12:52 UTC (105 seconds).

```morpheus-review
{
  "version": 1,
  "base": "3c5361eee74d95e04d2b496ac7cda36148fec915",
  "reviewed": "4aca2ea34cd416612998eeb7430d5953c695d680",
  "covered": "4aca2ea34cd416612998eeb7430d5953c695d680",
  "authorSession": "01a0e740-1916-74d2-84ea-59d230b51620",
  "reviewerSession": "/root/review_label280",
  "risk": "small",
  "elapsedMinutes": 1.75,
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_label280 cleared the exact remote head with no findings at small risk. It independently checked the complete diff, caller and compiled output, and all 75 local-review tests passed. No author fixes or follow-up were needed. Graph coverage reported changed metadata and excluded generated output; direct source inspection covered those limitations.",
  "findings": []
}
```
