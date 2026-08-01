---
id: MO-26-07-29-027
title: "Nothing moves an item from review to shipped"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [18]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-027` to `MO-26-07-29-027` (MO-057). References to `MO-027` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

Thirteen merged items were sitting in `review`. `pm claim` moves an item to in-progress and opening
a PR moves it to review, but **nothing moved it to shipped** — so the board stopped describing
reality and nobody noticed for two weeks of work.

A status nobody advances is a status nobody trusts. The `prs` field told the same story: declared
in the schema, rendered by the index generator, and empty on every single item.

## Shipped

`morpheus pm ship` — reconciles the roadmap against merged pull requests, using what the claim
model already establishes: the remote branch **is** the claim, and merging deletes it.

**Almost certainly shipped is not shipped.** A missing branch is the absence of evidence, not
evidence of a merge — it may have been deleted by hand or never pushed. So each candidate is
confirmed against a merged PR whose head branch carries the item's prefix, and when `gh` cannot
answer, nothing is written. `mergedPrs` returns `null` rather than `[]` for exactly this reason:
"no PRs found" is evidence and "gh is missing" is not, and collapsing them would let an absent tool
look like a clean board.

It scans every non-terminal item rather than only `review`. MO-015 had merged in PR #2 without ever
passing through review, which leaves a shipped item sitting in backlog — the most misleading state
on the board.

## What it found on first run

- 11 items promoted, with their PR numbers recorded
- **PR #1's branch was never deleted**, so MO-017 still read as a live claim and `pm claim MO-017`
  would have refused it forever. That earned its own outcome type: a false claim blocks work, which
  is worse than a status that merely describes it wrongly.
- MO-007 and MO-014 shipped before the branch convention existed, so it correctly refused to guess
  and asked for them by name
