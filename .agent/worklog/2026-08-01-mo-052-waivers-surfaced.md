---
date: 2026-08-01
agent: claude
roadmap: MO-26-08-01-052
outcome: shipped
summary: Waivers now report as a third finding level; writing the tests exposed a regex that made a bare `skip-tests:` capture the next line as its reason.
---

## The bug the tests found

`waiverReason` started as `(^|\n)\s*${key}:\s*(.*)$` with the `m` flag. `\s` includes newlines, so
on a body of:

```
skip-tests:

## Test plan
```

the `\s*` after the colon swallowed both newlines and `(.*)` captured **`## Test plan`** — a
perfectly real-looking reason. A waiver with nothing after it passed as a justified one, which is
the exact failure the rule exists to prevent, shipped inside the fix for it.

`[ \t]*` instead of `\s*`. Found by the test for "refuses an empty reason", which is the only
reason I wrote it — the behaviour looked obviously correct.

The general shape: **a permissive character class next to an anchor that was made line-aware.**
`\s` and `m` do not compose the way they read.

## Why a third level rather than a warning

`waived` had to be distinguishable from `warning` because they mean opposite things to a reader:
a warning says something might be wrong, a waiver says a rule was deliberately not applied and
here is who said so. Collapsing them would put the waiver in the same bucket as "no Open questions
section", which is noise nobody reads.

It does not affect the exit code. This is visibility, not policy — no cap on waivers, no ratchet,
no failing a PR for using one. Those are decisions to make *after* there is something to look at,
and there was no data because the waivers were invisible.

## The non-reason list

`yes`, `y`, `true`, `n/a`, `na`, `none`, `ok`, `-`, plus a four-character floor. Deliberately short
and deliberately not clever: the point is to stop the reflexive opt-out, not to grade prose. A
determined author can still write four characters of nonsense, and that is fine — it is then
visible nonsense in the check output, which is the whole change.

## Two existing tests changed on purpose

Both asserted that a waiver produces *no finding*. That was the behaviour being removed, so
updating them is the diff doing its job rather than a test being bent to fit — they now assert the
waiver is present, is `waived`, carries its reason, and still produces zero errors.
