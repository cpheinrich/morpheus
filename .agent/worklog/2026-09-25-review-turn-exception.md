---
agent: codex
date: 2026-09-25
roadmap: MO-26-09-25-11.52.12
outcome: review
---

# Explicit review-turn exceptions

Chris explicitly authorized one additional independent review on Evo PR277 after its normal three turns were exhausted. The reviewer completed that turn, but the record schema could not represent it. This change keeps the default cap and requires a per-extra-turn humanAuthorization record (approver, ISO timestamp, scoped reason). It preserves earlier turns and same-reviewer, budget, clearance, coverage and CI checks. Evidence remains an auditable attestation, matching the existing review model, not cryptographic proof. No dependency needed: extends existing Zod schema.

Validation: typecheck and compile passed. Full suite passed1397 cases with one failure solely because the old cap-error assertion expected Zod's former <=2 wording. Updated that assertion without changing its rejection behavior; focused review suite rerun passes52 tests. No web/app behavior change.

Independent review cleared the human-authorization schema with no findings. The reviewer independently passed52 focused tests and probed committed distribution rejection of absent authorization, over-budget turns, incomplete predecessors and missing scope.

```morpheus-review
{
  "version": 1,
  "base": "57f846252f330f740028c0b6d6a6491fe3eab888",
  "reviewed": "babe46c26e55c7ddfbe973fd8a4ed5ba6eda75e8",
  "covered": "babe46c26e55c7ddfbe973fd8a4ed5ba6eda75e8",
  "authorSession": "01a0d8cb-5b59-7261-978f-19fd9976dc80",
  "reviewerSession": "01a0d9ec-b303-75a1-9a23-f587b0e7ef3f",
  "risk": "normal",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent review cleared the human-authorization schema with no findings. The reviewer independently passed52 focused tests and probed committed distribution rejection of absent authorization, over-budget turns, incomplete predecessors and missing scope.",
  "findings": []
}
```
