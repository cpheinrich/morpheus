---
id: MO-26-07-29-028
title: "Brand answers editable as a file, not only a wizard"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [19]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-028` to `MO-26-07-29-028` (MO-057). References to `MO-028` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

The wizard was the only way in. Chris: *"you may want to fill out and edit multiple answers at once
instead of doing it purely sequentially."*

He is right, and the reason is structural. **The answers refer to each other** — `never` is written
against `feels`, `mission` gets sharper once `primaryAudience` is concrete — and a sequential
prompt makes you commit to each one before you can see the next.

## Shipped

`hq/brand/answers.md` is now the single source of the owner's input, editable directly. The wizard
is one way to fill it in.

`brand init` writes the file **before** asking anything, so quitting leaves a usable artefact
rather than nothing, and the opening message says so. `brand build` regenerates from the edited
file and asks nothing.

Questions are anchored by `<!-- morpheus:q <key> -->` rather than by matching heading text, so
rewording a heading does not break parsing. The comment is invisible when rendered.

`answers.json` is gone. A JSON record beside the editable file is a second source of truth by
another name.

## Why not keep both

Two files means answering the question of which one wins when they disagree, and every answer to
that question is worse than not having it.
