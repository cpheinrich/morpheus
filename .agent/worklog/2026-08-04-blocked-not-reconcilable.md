---
date: 2026-08-04
agent: claude
roadmap: MO-26-08-04-12.48.59
outcome: shipped
summary: reconcile() treated blocked as reconcilable, so pm claim silently shipped four blocked P0 safety gates in a downstream project.
---

# MO-26-08-04-12.48.59 — blocked is not a reconcilable status

## How it surfaced

Claiming an unrelated item in a downstream project printed one dim line naming four ids as "also
marked shipped, riding along in this branch". They were blocked P0 items gating a paper-trading kill
switch, ambiguous broker outcome recovery, an unsigned risk policy, and build provenance.

It was caught only because the diff was inspected after the claim. The summary line is dim, singular,
and reads like bookkeeping.

## The part that is easy to get wrong

The obvious fix is the unclaimed path, beside the existing `backlog` check. That is **not** the path
that fired.

Blocked items keep their branch on origin — `claim()` does that on purpose so partial work stays
reachable, and refuses to re-claim them for the same reason. So a blocked item takes the
`claims.length > 0` path, matches `mergedHere`, and falls into the `stale` branch, which writes
`shipped` before reporting. Guarding only the unclaimed path would have left the actual bug in place
while looking like a fix, and the repository's tests would not have noticed, because `reconcile()`
has no harness.

Both paths need the guard. The claimed one is the one that matters.

## Why blocked deserves a stronger guard than backlog

`backlog` is protected on the grounds that a reopen may have been deliberate — an inference about
intent. `blocked` needs no inference: `pm block` writes `needs:` into the frontmatter, so a merged
PR and an unfinished item are simultaneously true by construction. The groundwork PR merging is the
*expected* state of a blocked item, not evidence about it.

## Testing gap, stated rather than papered over

`reconcile()` shells out to `gh` through `mergedPrs()` and takes no injection point, so it cannot be
unit tested as it stands — which is why the existing tests cover `markShipped`, `didNoWork` and
`formatReconcile` only, and why this defect could ship. The new test follows that convention and
covers the report; the write guard rests on typecheck plus a manual run against the original
reproduction.

Extracting the outcome decision as a pure `(item, {claims, mergedHere, pr}) => ShipOutcome` would
make every path testable. Not done here: it restructures a function this contributor does not own,
on a first outside change, and the issue offers it.
