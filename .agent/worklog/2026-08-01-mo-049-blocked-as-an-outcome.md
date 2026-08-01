---
date: 2026-08-01
agent: claude
roadmap: MO-049
outcome: shipped
summary: pm block writes three records and routes the question to an inbox; the schema refinement is what makes "name your unblocker" enforceable rather than advisory.
---

## The design choice worth recording

`block()` writes files; the CLI wrapper does the git. `claim()` bundles both, and that is right
there — the branch *is* the claim, so git is intrinsic. For blocking it is incidental, and keeping
it out meant the whole thing could be tested against a temp directory instead of a repository.
29 tests, no git fixture, no mocking.

## Three records, not one

Writing only the item status was tempting and wrong. Each record answers a different question
later: the **item** says the work is stopped and why (read by the board and by the heartbeat), the
**worklog** says what was attempted before stopping (read by whoever picks it up), the **inbox**
puts the question in front of the person who can answer it. Drop the third and the blocker is
invisible until someone happens to read the board.

## What made "name your unblocker" cheap

It is a Zod refinement on `RoadmapItem`, so `pm validate` enforces it and `pm validate` already
runs in CI. No new check, no new workflow, no new place to look. The rule that would have been a
paragraph in AGENTS.md — and therefore eventually ignored — is a parse error instead.

The same trick made the ordering change free: `STATUS_ORDER` is a `Record<RoadmapStatus, number>`,
so adding `blocked` to the enum was a compile error until the index generator was updated. The type
system found the second site before I did.

## The claim collision I nearly shipped

A blocked item keeps its branch on purpose. Which means `pm claim MO-051` on a blocked item hits
`findClaims` and refuses with *"already claimed by branch mo-051-…"* — technically true, and it
reads as if the item is permanently unclaimable by anyone including the person who blocked it.

Fixed by reordering: read the item before checking claims, so the error can be specific. A blocked
item now gets its own message naming the actual recovery (`git checkout` then `pm unblock`) rather
than the generic collision text. Worth noting because the bug was invisible until I imagined
someone resuming — the tests all passed.

## A dead bug found on the way

`src/inbox/parse.ts` matched roadmap ids in headings with `/(RM-\d{3,})/`. Ids were namespaced per
project in MO-002, so no current id could match — every roadmap link in every inbox heading has
been dropped for as long as the current ids have existed. Nothing failed, because nothing *read*
the parsed value. It only surfaced because `pm block` writes a heading with an id in it and I wrote
a test asserting the round trip.

The general shape: a field nobody reads cannot be observed to be broken. Same family as the three
dangling edges MO-048 found.
