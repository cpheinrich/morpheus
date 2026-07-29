---
date: 2026-07-29
agent: claude
roadmap: MO-031
outcome: shipped
summary: Detectors parse what they find; reconcile stops overriding deliberate reopens; YAML numbers accepted in goals.
---

## The pattern I keep re-introducing

Chris caught that an empty file passed as a completed checklist step. I had written the exact
argument against this a few hours earlier for `tokens.json` — *"an empty scaffold beside a finished
design is worse than no file, because it looks done in a listing"* — and then wrote three detectors
that check for a filename.

Worth naming plainly: **knowing a principle is not the same as applying it, and the gap shows up
where the check is cheap.** `hasFilesIn` was one line; parsing is five. The cheap version got
written without the principle being consulted.

## Reconcile arguing with its owner

I reopened MO-015 deliberately, and `pm claim` re-shipped it on the next run — twice — by matching
PR #2's branch prefix.

`backlog` is now reported rather than written. The reasoning generalises: **reconciliation cannot
tell a deliberate reopen from a status nobody updated**, and when a tool cannot distinguish those,
it should defer to the human rather than assert.

Third instance of the same underlying rule, which is now well-established in `learned.md`: never let
an unanswerable question render as a confident answer.

## A real bug from a test fixture

Writing a goal fixture, `target: 1` failed with "expected string, received number". YAML makes an
unquoted `1` a number, and that is the most natural thing to write for a numeric target — so the
file was right and the parser was wrong.

Second time YAML's scalar coercion has bitten this project after the date one. `metric`, `target`
and `current` now use `looseString`, mirroring `isoDate`.

That fixture was written to test something else entirely. **Real content keeps finding what tests
built from assumptions do not** — fourth time now.
