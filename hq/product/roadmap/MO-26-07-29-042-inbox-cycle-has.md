---
id: MO-26-07-29-042
title: "An inbox cycle has no roadmap item to ride"
status: shipped
priority: P1
owner: agent
prs: [35]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-042` to `MO-26-07-29-042` (MO-057). References to `MO-042` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

An inbox cycle is real work — read the replies, promote decisions, archive, write a fresh inbox —
that belongs to no feature and so has no roadmap item to claim. But `main` is protected, so it
needs a branch, and `check pr` expects a branch to stake an id.

The workaround was to ride an item that happened to be claimed, and it did real damage. PR #31
moved the inbox on `mo-010-simplify-architecture-md-for-first-time`. Merging released that claim,
and reconcile marked **MO-010 shipped with `prs: [31]`** — against a PR that changed only
`hq/inbox/` and `.agent/inbox-archive/`. The architecture work was never started; the inbox in the
same PR said so in as many words.

A board that lags reality stops being read. A board that runs *ahead* of reality is worse: a
lagging item gets corrected when someone looks at it, and a shipped item is never looked at again.

## Approach

Give records-only work a first-class shape rather than a workaround.

`check pr` treats a PR confined to `hq/inbox/` and `.agent/` as needing no roadmap item, so an
`inbox-<YYYY-MM-DD>` branch passes. The same rule blocks the borrowing that caused this: a
records-only PR on a branch that *does* stake an id is an error, because merging it marks that
item shipped against work it did not do.

MO-010 is reopened as part of this.
