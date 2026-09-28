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

Independent review pending.
