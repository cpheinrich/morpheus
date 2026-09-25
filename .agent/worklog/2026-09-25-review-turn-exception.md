---
agent: codex
date: 2026-09-25
roadmap: MO-26-09-25-11.52.12
outcome: review
---

# Explicit review-turn exceptions

Chris explicitly authorized one additional independent review on Evo PR277 after its normal three turns were exhausted. The reviewer completed that turn, but the record schema could not represent it. This change keeps the default cap and requires a per-extra-turn humanAuthorization record (approver, ISO timestamp, scoped reason). It preserves earlier turns and same-reviewer, budget, clearance, coverage and CI checks. Evidence remains an auditable attestation, matching the existing review model, not cryptographic proof. No dependency needed: extends existing Zod schema.

Validation: typecheck and compile passed. Full suite passed1397 cases with one failure solely because the old cap-error assertion expected Zod's former <=2 wording. Updated that assertion without changing its rejection behavior; focused review suite rerun passes52 tests. No web/app behavior change.
