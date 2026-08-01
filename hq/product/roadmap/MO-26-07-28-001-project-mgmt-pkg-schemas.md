---
id: MO-26-07-28-001
title: "Project management package: schemas, parser, index generator, CLI"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: []
created: 2026-07-28
updated: 2026-07-28
---

> Migrated from `MO-001` to `MO-26-07-28-001` (MO-057). References to `MO-001` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

The file-based PM layer: Zod schemas for roadmap items, goals, requests, and
journal entries; a frontmatter parser that reports every invalid file rather than
throwing on the first; a README index generator; and `morpheus pm validate | index | new`.

## Outcome

Shipped with 23 tests. One design bug surfaced during testing: YAML parses unquoted
`2026-07-01` into a Date object, so dates failed validation. Fixed with a preprocessing
step rather than requiring quoted dates, since hand-written frontmatter should stay
natural to write.
