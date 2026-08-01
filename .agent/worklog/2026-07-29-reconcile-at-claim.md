---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-029
outcome: shipped
summary: Reconciliation moved to claim time after the post-merge instruction proved unfollowable.
---

## The mistake, found by following my own instructions

MO-027 shipped `pm ship` and told AGENTS.md to run it after merging. I did, on `main`, and got a
modified roadmap file with nowhere to go — `main` is protected. The step I had documented could not
be performed.

## The lesson

**A maintenance step needs a home, not just a trigger.** "After merging" is a moment, not a place:
there is no branch, no commit, and nothing to attach the change to. `claim` is a place — it already
fetches from origin, it already makes a commit, and it happens exactly when someone is about to
open a PR.

Worth generalising: when a step produces a change, ask where that change lands before deciding when
to run it. I checked the timing and not the destination.
