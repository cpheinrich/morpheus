---
id: MO-26-07-29-039
title: "kit/design: token pipeline — one generator, not three"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [32]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-039` to `MO-26-07-29-039` (MO-057). References to `MO-039` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

Three projects have independently written the same script: brand tokens to CSS custom properties.
`cpheinrich.com/web/scripts/generate-brand-css.mjs`,
`heinrichbros.com/web/scripts/sync-brand-theme.mjs`, and Lakina's `tokens.css`.

Extract-on-second-use, passed twice over — and the three differ in ways that matter. One throws on
arrays, one silently drops them, one hardcodes every variable name so adding a token means editing
the generator.

## Shipped

`morpheus tokens build`, exported as `morpheus-kit/design`. Emits CSS custom properties and a typed
TS module.

Verified against `cpheinrich.com`: **identical variable names and identical values** to its
hand-rolled script, 79 tokens.

## Two decisions

**Writes nothing when the source has problems.** A stylesheet built from a half-read token file
still renders, which is how the mistake reaches production.

**Emits TS as well as CSS.** A deleted custom property renders as nothing and no stylesheet catches
it; a deleted key does not compile.

## Deliberately not done

**No semantic layer.** Only heinrichbros has one and its mapping is bespoke. Inventing a shared
vocabulary from a sample of one would be guessing — question 3 in the current inbox.
