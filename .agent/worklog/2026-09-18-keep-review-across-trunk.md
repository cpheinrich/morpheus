---
date: 2026-09-18
agent: claude
roadmap: MO-26-09-18-08.14.37
outcome: review
summary: Merging trunk never invalidates a cleared review; hand-resolved merges are named, not hidden.
---

Chris was concerned that an agent not actively driving a merge would watch `main` keep moving,
each move triggering a new review or exhausting the allocated turns. He chose the human-team
convention: merging `main` never invalidates a review, CI still has to pass, and the gate can be
tightened later if it leaks. This closes the 2026-09-16 inbox question and #245.

The implementation walks the first-parent commits in the ranges no reviewer cleared and accepts
three shapes: a trunk merge Git's `merge-tree --write-tree` reproduces exactly, a hand-resolved
trunk merge named in `trunkIntegrations` with a reason, and a worklog-only commit. That replaced
the `documentationIntegrations` proof from #253 (allowlisted Markdown, source review records,
rename-free reconstruction), which is now subsumed: its field is still parsed so the two records
on trunk that carry it remain valid, but nothing enforces it.

Two choices worth recording. First, reconstruction now runs with Git's default rename detection,
where #253 disabled it and refused rename-resolved merges. The goal changed: #253 asked "could
this merge have smuggled anything", this rule asks "is this exactly what `git merge` produced",
and `git merge` detects renames. Second, the old equality check between the recorded base and the
PR's merge base became an ancestor check. Equality was the mechanism that forced a turn per trunk
advance; under the new rule trunk moving past the recorded base is the expected state.

Dead end: allowing a hand-resolved merge with no record at all. It would have matched Chris's
wording literally, but a conflict resolution can contain arbitrary code, and a one-line entry is
cheap where an invisible edit inside a merge commit is exactly the shape nobody re-reads.

## Independent review

A high-risk independent review of 02098f9 found no substantive defects, three minor findings and one incidental note; the author fixed all three minors in 901db9e without a second reviewer pass, and the review completed in seven minutes of a thirty-minute ceiling.

The reviewer verified the bounding argument independently in a scratch copy with eight adversarial
merge shapes (swapped parents, an unreviewed commit as either parent, a nested merge, an octopus,
a trunk-side rename) and ran seven guard-removal mutants against the suite; six were caught. The
survivor was R01: the octopus refusal had no test of its own, so one was added. R2: the reviewer
prompt omitted the worklog-only exception that every other document states; fixed. R3: a no-op
second merge line in the exact-merge test; removed. R4, pre-existing: a local `check pr` whose
`origin/main` is behind the merged trunk commit reports "trunk only" until `git fetch`; noted so it
is not chased as a code bug.

```morpheus-review
{
  "version": 1,
  "base": "2dee1068953fa8dc6aa53c55add3736c8b527104",
  "reviewed": "02098f9c267688db4b0c650eabe2a8047f4aea80",
  "covered": "901db9e3c65394fe6c175dfe12f482f3fbbb2833",
  "authorSession": "claude-26bfbe60-f2a5-5ad4-96a2-96014aa4119e",
  "reviewerSession": "reviewer-mo-26-09-18-c",
  "risk": "high",
  "elapsedMinutes": 7,
  "outcome": "complete",
  "summary": "A high-risk independent review of 02098f9 found no substantive defects, three minor findings and one incidental note; the author fixed all three minors in 901db9e without a second reviewer pass, and the review completed in seven minutes of a thirty-minute ceiling.",
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "The octopus-merge refusal had no test that fails when the guard is removed; the mutant survived because the generic path check still rejects it.",
      "paths": ["tests/local-review.test.ts"],
      "disposition": "fixed",
      "response": "Added a test merging two trunk commits at once after coverage and asserting the only-two-parent message."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "The reviewer prompt said any other commit after coverage invalidates the review, omitting the worklog-only exception every other document states.",
      "paths": ["src/review/local-prompt.ts", "dist/review/local-prompt.d.ts", "dist/review/local-prompt.js", "dist/review/local-prompt.js.map"],
      "disposition": "fixed",
      "response": "The prompt now says any commit beyond the task worklog itself invalidates coverage; dist regenerated."
    },
    {
      "id": "R03",
      "severity": "minor",
      "description": "A second merge of an already merged trunk commit in the exact-merge test was a no-op that asserted nothing.",
      "paths": ["tests/local-review.test.ts"],
      "disposition": "fixed",
      "response": "Removed the line; the later-trunk merge that follows is the real second-merge check."
    },
    {
      "id": "R04",
      "severity": "incidental",
      "description": "A local check pr whose origin/main is behind the merged trunk commit reports the trunk-only refusal until the ref is fetched; pre-existing, CI is unaffected.",
      "paths": ["src/review/local.ts"],
      "disposition": "deferred",
      "response": "Not introduced here; the old equality check depended on the same ref. Noted so the message is not chased as a code bug."
    }
  ]
}
```
