---
date: 2026-09-22
agent: claude
roadmap: MO-26-09-22-04.57.22
outcome: review
summary: A late correction after clearance spends a remaining review turn, named by its scopeReason.
---

Evo #244 (issue #247) had both review passes cleared when the full iOS suite found two legacy UI
tests that assumed the old layout. The fix was two files with focused tests, but it necessarily
landed after `covered`, and the contract had no move: a code commit after coverage invalidated
the review, `validateReviewRecord` refused any turn after a `cleared` one, and the runbook's
"explicit scope and budget decision" named no one who could make it. Chris decided that a late
correction may spend one of the remaining turns.

The shape reuses `scopeReason`, the field a trunk-integration turn already carries as its scope
decision. A non-final `cleared` turn is accepted when the next turn names its reason; a non-final
`blocked` turn needs none on its successor; an `incomplete` turn still has no successor. The
first follow-up after an initial review with no substantive findings is treated the same way,
because the initial verdict was itself a clearance. A survey of every Morpheus worklog with a
follow-up showed that each one after a non-substantive review already carried a `scopeReason`
(they were all trunk integrations). The reviewer extended the survey to Evo and Lakina and found
six merged records with that shape and no reason, among them Evo's `2026-09-16-track-welcome`,
the late correction this ticket cites, whose scope decision sits in `summary`. Merged records are
never re-validated and no open `agent-reviewed` PR carries the shape, so the stricter rule refuses
nothing in flight; the earlier claim that every committed record already satisfied it was
Morpheus-only and is corrected here. Nothing in
`checkLocalReview` changed: with a follow-up present, the `reviewed`..`covered` range was already
covered by the follow-up chain rather than path-checked, so the correction commits are covered by
the reviewer's clearance of the correction turn, and a plain code commit after the new `covered`
still invalidates.

Two dead ends. First, requiring the `scopeReason` on the turn that was cleared rather than the one
that spends the slot: the cleared turn was written before anyone knew a correction would be needed,
so the reason can only truthfully sit on the later turn; a test now pins that a reason on the
earlier turn does not count. Second, a separate `correction: true` flag instead of `scopeReason`:
it would have meant a second field with one rule against using both, when the existing field
already means "the author made a scope decision and this is it".
