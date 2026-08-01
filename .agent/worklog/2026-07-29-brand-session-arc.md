---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-021
outcome: shipped
summary: The generated prompt now runs a design session with an arc instead of requesting one batch of mockups.
---

## The correction

MO-020 got the boundary right — the wizard hands off — but the prompt it generated still asked for
eight mockups in one shot and a pick at the end. Chris reframed it: the agent should be cast as the
brand designer, guide the owner through iterating on real mocks, and consolidate at the end.

That is a better shape for the same reason MO-020 was: **a single batch is not a design process.**
The reactions to round one are what make round two good, and a one-shot ask discards them.

## Worth remembering

Two lines in the prompt do most of the work:

- **"Show, do not describe"** — never ask someone to choose between adjectives. A description
  cannot be reacted to, and the reaction is the whole point.
- **Push back when a liked direction breaks a stated constraint.** The boundaries were written
  while thinking about the whole product; the reaction is to one screen. The agent is the only
  party holding both.

## Note

`generateBrand` never overwrites, so a project that ran the wizard before this change keeps the old
prompt. Delete `hq/brand/explore-prompt.md` and re-run to pick up the new one.
