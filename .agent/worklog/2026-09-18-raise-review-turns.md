---
date: 2026-09-18
agent: claude
roadmap: MO-26-09-18-07.36.00
outcome: review
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

## Independent review

A high-risk independent review of bd93880 found no substantive or minor defects and two incidental notes; the author accepted both without code changes, no follow-up turn was needed, and the review completed in ten minutes of a thirty-minute ceiling.

I-01: `checkFollowUpChain` requires a `scopeReason` whenever a turn carries `base`, even one equal
to the original base, where the old inline check only asked when the base moved. Kept as is: it is
stricter, no committed record carries a base-bearing follow-up, and a base that did not move has
no reason to be recorded. I-02, pre-existing: documentation-integration source records are not run
through the chain check; they were gated at their own merge, unchanged by this PR. The reviewer
also noted that a blocked turn followed by a cleared turn on the same commit is accepted, which is
the contract's reasoned-retraction path and is relied on by an existing test.

```morpheus-review
{
  "version": 1,
  "base": "9c2c7463808cfe3f62f9fde4f92804e91cca595e",
  "reviewed": "bd93880f6b3dfff03536d08dd16887ad90191b61",
  "covered": "bd93880f6b3dfff03536d08dd16887ad90191b61",
  "authorSession": "claude-26bfbe60-f2a5-5ad4-96a2-96014aa4119e",
  "reviewerSession": "reviewer-mo-26-09-18-b",
  "risk": "high",
  "elapsedMinutes": 10,
  "outcome": "complete",
  "summary": "A high-risk independent review of bd93880 found no substantive or minor defects and two incidental notes; the author accepted both without code changes, no follow-up turn was needed, and the review completed in ten minutes of a thirty-minute ceiling.",
  "findings": [
    {
      "id": "I-01",
      "severity": "incidental",
      "description": "checkFollowUpChain demands a scopeReason for any turn carrying base, even one equal to the original base, where the old inline check only asked when the base moved.",
      "paths": ["src/review/local.ts"],
      "disposition": "deferred",
      "response": "Kept as is: stricter rather than weaker, no committed record carries a base-bearing follow-up, and a base that did not move has no reason to be recorded."
    },
    {
      "id": "I-02",
      "severity": "incidental",
      "description": "Documentation-integration source records are validated and base-checked but not run through checkFollowUpChain; pre-existing, unchanged by this PR.",
      "paths": ["src/review/local.ts"],
      "disposition": "deferred",
      "response": "Pre-existing behaviour: sources were gated by the chain check at their own merge. Left for a separate item if it ever matters."
    }
  ]
}
```
