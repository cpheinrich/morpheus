---
date: 2026-08-05
roadmap: MO-26-08-05-16.29.20
outcome: shipped
---

# The onboarding inbox detector read the roster as an inbox

Found while migrating heinrichbros.com off `hq/inbox/`, not by looking for it. The move went
cleanly, `inbox validate` and `team validate` both passed — and then `morpheus init status`
**unticked** a step that had been done for a week:

```
- [x] **An inbox file for each person** — `detected`
+ [ ] **An inbox file for each person** — `detected`
```

`src/onboarding/tasks.ts` filtered the directory with `f.toLowerCase() !== "readme.md"` and then
required every remaining file to parse as an inbox. That was correct when `hq/inbox/` held nothing
but inboxes and a README. `hq/team/` also holds `members.md`, which is a roster and does not parse
as an inbox — three schema errors, none of them wrong.

## What is actually worth recording

**The fix is one line; the shape has now cost four bugs in a fortnight.** The branch-id pattern, the
fetch arguments, the `today()` timezone, and `TEAM_RESERVED`: each was a value written in two
places, where updating one did not update the other. `TEAM_RESERVED` was *introduced* in the same
PR that moved the folder, precisely so there would be one answer to "what counts as an inbox" —
and this module still had its own.

So the lesson is not "remember to use the constant". It is that **introducing a shared constant
does not retire the copies**; the copies have to be hunted, and a grep for `TEAM_RESERVED` finds
the call sites that already agree rather than the ones that do not. The search that would have
found this is a grep for `readme.md`, which is what the wrong copies look like.

**It also shows what the migration guard missed.** PR #88 fixed the `hq/inbox` string in this exact
file — and left the filter three lines above it untouched, because the filter never mentioned a
path. A reference to the old *layout* does not have to name the old *directory*.

## Dead end

Briefly considered making `parseInboxFile` return "not an inbox" rather than a list of schema
errors, so a caller could distinguish "malformed inbox" from "not one". That is a bigger change
than the bug justifies, and it moves the judgement into the parser where every caller then inherits
it — the reserved list is a property of the *folder*, which is where it already lives.

## Test

Written against `TEAM_RESERVED` itself, looping over the set, rather than against the two names in
it today. The bug was a hand-written filter drifting from the shared set; a test that hard-codes
the same two names drifts in exactly the same way. Verified failing before the fix.
