---
id: MO-26-07-29-021
title: "Brand prompt frames a design session, not a deliverable"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [11]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-021` to `MO-26-07-29-021` (MO-057). References to `MO-021` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

MO-020 established that the wizard hands off rather than finishing the job. The prompt it
generated still had the shape wrong: it asked for eight mockups in one batch, then a pick.

**A single batch is not a design process.** Nobody arrives at an identity without reacting to
something first — the reactions are the signal, and one round throws them away.

## Shipped

The prompt now casts the agent explicitly: *"You are acting as the brand designer for X. This
document is your brief, not your output."* It describes a session with an arc:

1. **Diverge** — genuinely different bets, different enough that rejecting one is informative
2. **Ask what landed** — and push back when the reasoning contradicts the brief
3. **Narrow** — real screens, real copy, real states
4. **Converge** — until one direction is clearly right rather than merely acceptable

Two instructions carry most of the weight. **"Show, do not describe"** — never ask the owner to
imagine a direction or choose between adjectives, because a description cannot be reacted to. And
**tell them when a direction they like breaks a constraint they set**, since the boundaries were
written while thinking about the whole product and the reaction is to one screen.

It closes by consolidating into `tokens.json`, `visual-system.md` and `assets/` — *first working
version, not final*, with unresolved things named rather than papered over.

## Why this shape

The wizard's deliverable is a runway, and the runway's job is to make the interactive session
start from constraints instead of from taste.
