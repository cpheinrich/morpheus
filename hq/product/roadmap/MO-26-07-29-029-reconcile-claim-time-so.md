---
id: MO-26-07-29-029
title: "Reconcile at claim time so ship never orphans a change on main"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [20]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-029` to `MO-26-07-29-029` (MO-057). References to `MO-029` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

MO-027 shipped `pm ship` and documented it as "run it after merging". Running it that way produced
a modified roadmap file in a dirty working tree on **protected `main`**, with nowhere to push it.
The instruction was unfollowable, and I wrote it hours earlier.

## Shipped

`pm claim` reconciles before branching, so merged work is marked shipped and rides along in the
claim commit. There is never an orphan change on `main`, and the housekeeping happens at the one
moment somebody is definitely about to open a PR.

`pm ship` remains for running it deliberately.

## Why this is the right seam

A maintenance step with no natural home gets dropped. Attaching it to `claim` gives it one:
reconciling costs nothing extra there, `claim` already fetches from origin, and the resulting commit
already exists.
