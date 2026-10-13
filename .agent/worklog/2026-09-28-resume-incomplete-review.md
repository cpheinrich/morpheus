---
roadmap: MO-26-09-28-18.17.33
---

# Authorized continuation after missing review evidence

Issue #302 reproduces Evo #308: its original reviewer truthfully returned incomplete while missing diagnostic evidence, then cleared the change in later human-authorized turns. The validator treated every incomplete as budget exhaustion. The fix requires authorization on the immediately following turn; existing historical/new budget checks still reject overruns. No consumer verdict is rewritten.

## Validation

- `pnpm test`: 1513 tests passed across 56 files, including five new regression cases.
- `pnpm typecheck`, `pnpm compile`, `pnpm lint`: passed. Generated declaration and JavaScript outputs committed.
- Actual Evo #308 pending record passed ReviewRecord.parse and validateReviewRecord without edits.
- Reviewer: `pnpm exec vitest run tests/local-review.test.ts`: 89 passed.
- Graph tools unavailable; install --check found no exact-checkout index and attempted repair refused activation while CBM sessions were active. Used bounded source verification; no graph completeness claim.
- Claude routing inspected before a run. This task is bound to Evo and the bridge restricts cwd overrides to the same repository; Morpheus implementation remained in Codex.

## Independent review

Independent normal-risk review cleared the change with no findings. Explicit next-turn human authorization permits an evidence-pending incomplete follow-up to resume while preserving historical and new budgets, reviewer identity, final clearance, finalization restrictions and commit coverage. The reviewer independently passed all 89 local-review tests.

```morpheus-review
{
  "version": 2,
  "base": "5da740d88634afa0adc15ce9f02030b57b6e63a3",
  "reviewed": "7898007b251470caa2701ccfcf60c4aca7f488e0",
  "covered": "7898007b251470caa2701ccfcf60c4aca7f488e0",
  "authorSession": "01a0ea7c-226e-7b92-a4ec-5e815b0ab41b",
  "reviewerSession": "/root/authorized_review_checker/incomplete_review_checker",
  "risk": "normal",
  "elapsedMinutes": 1.2938666666666667,
  "timing": {
    "source": "runner",
    "durationMs": 77632,
    "evidence": "Reviewer session 01a0eac0-077d-7db2-af37-ee85a373b467, turn 01a0eac0-07d8-7c51-a8aa-14662ba4a33d task_complete duration_ms=77632. Explicit task_started/task_complete transcript events at 2026-09-29T01:20:48.631Z and 2026-09-29T01:22:06.239Z; includes packet reading and tools, with no idle-gap inference."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review cleared the change with no findings. Explicit next-turn human authorization permits an evidence-pending incomplete follow-up to resume while preserving historical and new budgets, reviewer identity, final clearance, finalization restrictions and commit coverage. The reviewer independently passed all 89 local-review tests.",
  "findings": []
}
```
