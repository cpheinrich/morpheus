---
id: MO-26-07-29-025
title: "Convergence requires evidence on more than one surface"
status: shipped
priority: P2
goal: MO-G-2026-Q3-01
owner: agent
prs: [16]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-025` to `MO-26-07-29-025` (MO-057). References to `MO-025` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

From [issue #12](https://github.com/cpheinrich/morpheus/issues/12), part 3, **trimmed**.

The core claim is right: "real screens, real copy, real states" is underspecified, and a strong
hero can fail immediately in a dense form. Morpheus should not declare convergence off one
attractive marketing mockup.

The proposed acceptance set is ten bullets covering states, dark mode, contrast, reduced motion,
imagery provenance and brand-architecture differentiation. That is a design-QA framework, and
MO-022 just argued that a checklist long enough to be thorough is one nobody completes. Shipping it
whole would produce a gate that gets skipped, which is worse than the current underspecification
because it would look enforced.

## Approach

Gate on the minimum that actually catches the failure:

- one expressive surface — the marketing case a mockup naturally flatters
- one dense functional surface — inputs, labels, an error, a result
- both at mobile and desktop

Everything else from the issue goes into the prompt as prompts to consider, not conditions to
satisfy.

Plus the completion report, which is cheap and good: canonical files written, surfaces reviewed,
unresolved decisions, temporary assets still needing replacement, departures from the brief and why
they were accepted, and **checks not run**. That last line is the one that makes "first working
version" honest rather than conversational.
