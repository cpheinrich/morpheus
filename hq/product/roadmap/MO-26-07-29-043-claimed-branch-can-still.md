---
id: MO-26-07-29-043
title: "A claimed branch can still ship an item it did no work on"
status: shipped
priority: P1
owner: agent
prs: [37]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-043` to `MO-26-07-29-043` (MO-057). References to `MO-043` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

MO-042 added `isRecordsOnly` and its PR claimed the rule blocked "the exact configuration that
shipped MO-010". Checking that claim against PR #31's real file list rather than the memory of it:

```
.agent/inbox-archive/2026-07-29-1330-cpheinrich.md
hq/inbox/cpheinrich.md
hq/product/roadmap/MO-010.md      ← board
hq/product/roadmap/MO-037.md      ← board
hq/product/roadmap/README.md      ← board
```

`isRecordsOnly` is **false** on that, so the new rule would not have fired. It cannot: a borrowed
branch always carries board files, because claiming reconciles statuses and `pm index` regenerates
the tables into the same commit. MO-042 solved the stated ask — a clean cycle on an
`inbox-<date>` branch passes — and missed the damage half.

An audit of every shipped item against its PR's diff found the same shape twice more: MO-015
credited to PR #2 (the work was PR #22), and MO-003 to PR #26, which is legitimate.

## Approach

A second predicate, because it answers a second question. `isRecordsOnly` asks "does this need an
item at all?" and must stay narrow — widening it to include `hq/product/` would let a PR excuse
itself from the roadmap rules by editing the roadmap. `hasNoSubstantiveChange` asks "did this PR
do the work of the item its branch claims?" and covers records *and* board.

Blocking rather than a warning, since a warning would not have stopped any of the three. Waivable
with `records-only: <reason>` in the body — the `skip-tests:` shape — because MO-003 shows some
items really do deliver a record.

MO-015's attribution is corrected as part of this.
