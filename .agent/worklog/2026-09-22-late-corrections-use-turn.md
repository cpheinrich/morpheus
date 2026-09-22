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

## Independent review

A high-risk independent review of c4964a4 found no substantive defects and two minor findings; the author fixed both in 45a8ad5 without a second reviewer pass, and the review completed in four minutes of a thirty-minute ceiling.

The reviewer ran the typecheck, the focused review suite and the scaffold/prompt suites, diffed a
fresh compile against the committed `dist/`, walked each acceptance bullet to the test that fails
on the wrong answer, and fetched the records of every open `agent-reviewed` PR across the projects
(Evo #262, Evo #249, Lakina #340) to confirm none is refused by the new rule. R01: a hand-resolved
trunk merge named in `trunkIntegrations` before a late correction fell outside every walked range
once `covered` moved past it, and the stray check refused the record; trunk merges inside a
follow-up-covered range now count as accepted, with a test that fails without the fix. R02: the
worklog and decision entry claimed every committed record already satisfied the clean-initial
scope-reason rule, but the survey was Morpheus-only and six merged Evo and Lakina records have that
shape without a reason; both texts now say so, and the practical conclusion (nothing in flight is
refused) stands on the reviewer's own survey. The reviewer also noted that a voluntary re-check of
minor-only fixes now reads as a late correction and needs a `scopeReason`; that is the documented
intent, and no change was made.

```morpheus-review
{
  "version": 1,
  "base": "fb459bcd2d8301eb18ae7f79215d0b984f175b49",
  "reviewed": "c4964a44423167130baab6519e9118bac801ccd4",
  "covered": "45a8ad5e63a67425a2a2671d78e62bace72ec3fa",
  "authorSession": "claude-subagent-247",
  "reviewerSession": "reviewer-mo-26-09-22-a",
  "risk": "high",
  "elapsedMinutes": 4,
  "outcome": "complete",
  "summary": "A high-risk independent review of c4964a4 found no substantive defects and two minor findings; the author fixed both in 45a8ad5 without a second reviewer pass, and the review completed in four minutes of a thirty-minute ceiling.",
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "A hand-resolved trunk merge named in trunkIntegrations before a late correction sat outside every walked range once covered moved past it, so the stray check refused a record the runbook had required the author to write.",
      "paths": ["src/review/local.ts", "dist/review/local.js", "dist/review/local.js.map", "tests/local-review.test.ts", "docs/runbooks/independent-review.md"],
      "disposition": "fixed",
      "response": "Trunk merges on the first-parent chain between reviewed and covered are accepted when a follow-up exists, since the correction turn covered them; a test pins the shape and fails without the fix, and the runbook says the entry stays valid."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "The worklog and decision entry stated that every committed record with a follow-up after a non-substantive review already carried a scopeReason; the survey covered Morpheus only, and six merged Evo and Lakina records have that shape without one.",
      "paths": [".agent/worklog/2026-09-22-late-corrections-use-turn.md", ".agent/decisions.md"],
      "disposition": "fixed",
      "response": "Both texts now say the survey was Morpheus-only, name the reviewer's wider count, and rest the conclusion on merged records never being re-validated and no open agent-reviewed PR carrying the shape."
    }
  ]
}
```
