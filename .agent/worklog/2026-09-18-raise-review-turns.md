---
date: 2026-09-18
agent: claude
roadmap: MO-26-09-18-07.36.00
outcome: in-progress
summary: Cap independent review at three turns; a third follow-up only after a blocked second.
---

Chris asked whether the relaxation for non-substantive changes after review had merged, and to
raise the review cap from two turns to three while keeping its purpose: stop an author and a
reviewer trading fixes and findings indefinitely, and leave only substantive unresolved concerns
for a human.

What had merged: #253 preserves a cleared review across the integration of *already reviewed
documentation from trunk*, proven by an exact conflict-free merge tree. It does not cover an
author's own docs-only edits after clearance, nor code arriving from trunk; those remain in the
open 2026-09-16 inbox item (issues #245, #247), which this change deliberately does not decide.

Shape chosen: `followUps` as an ordered array of at most two turns. Every turn but the last must
be `blocked`, the last must be `cleared` on `covered`, each is held to the follow-up ceiling at
its boundary, and turn commits must form an ancestor chain. A turn that moved the base still
needs a `scopeReason`, and later turns may only move it forward. The legacy single `followUp`
object validates as one turn so existing worklogs, and the documentation-integration sources that
parse them, keep working. Considered making `followUp` accept an array instead of a new field;
rejected because a field whose type changes shape is harder to read in a record than two fields
with one rule against using both.

Dead end avoided: extending the cap by letting a *cleared* follow-up be followed by another turn
for trunk integration. That is option A of the open inbox item and Chris has not chosen it; the
third turn here is reachable only through a `blocked` second turn.
