---
date: 2026-11-09
roadmap: MO-26-11-09-15.15.57
tags: [engineering]
---

# Honor a newly filed deferral after follow-up clearance

Issue #615 showed the final-turn structural check ran before the documented Git-based allowance for a newly filed deferral. The validator now asks the same Git logic whether the covered tail contains a qualifying ticket. Existing ancestry and per-commit checks still control the tail, and record-only callers still require equality or a conditional clearance.

The focused local-review and PR-check suites passed all 291 cases. New cases prove acceptance for a newly filed deferred item after clearance and rejection for unrelated source changes or edits to an existing item. Enforced complexity passed, with an existing validator advisory.
