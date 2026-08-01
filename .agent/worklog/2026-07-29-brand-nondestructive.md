---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-019
outcome: shipped
summary: Brand generation made non-destructive; refresh added; token ownership disambiguated.
---

## The bug Codex found

`brand init` wrote an empty `tokens.json` even when the project declared an existing
`visualSource`. On Darwin or Evo that would have produced two token files that both look
canonical — and the failure would have surfaced weeks later as colours that disagree between
surfaces.

Worth noting *how* it was found: an external reviewer reading the code, not a test. The tests all
passed, because they only exercised the greenfield path. **A test suite written by whoever wrote
the feature tends to test the case they had in mind.**

## Where I disagreed with the review

Codex proposed a `brand migrate` command — DTCG merging, conflict detection, dry-run, atomic
aborts, full test matrix. The invariants are right and are now enforced by refusing to overwrite.
The tooling is not: there are two projects to migrate, both being done by hand, and the hard part
is judgment a merger cannot exercise.

Extract on the second use. Two hand-migrations become the spec.

## Also

`brand refresh` exists because Chris made a good point: the pressure to get a brand perfect on the
first pass is what stops people writing one down at all. The wizard now says up front that it can
be re-run, and prefills previous answers so revising is editing rather than reconstructing.
