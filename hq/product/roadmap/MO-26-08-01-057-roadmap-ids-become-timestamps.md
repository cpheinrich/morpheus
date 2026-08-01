---
id: MO-26-08-01-057
title: "Roadmap ids become timestamps, not a coordinated integer"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [58]
created: 2026-08-01
updated: 2026-08-01
---

> Migrated from `MO-057` to `MO-26-08-01-057` (MO-057). References to `MO-057` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

A sequential integer id requires every writer to agree on what the last one was. That agreement
does not exist and cannot be made to exist.

## The evidence, all from one day

- `pm new` offered **MO-049** while a parallel session held it as an *untracked file* — invisible
  to an allocator that reads item files and `origin`, because an untracked file is in neither
- It would have offered **EV-005** while PR #12 held EV-005 through EV-008 on its branch; caught
  only by running `git ls-tree` on the open branch first
- **MO-049, MO-050, MO-051 and MO-052 were all created in the same second** — `15:26:34`. A
  decomposition fan-out allocates instantaneously, so even second resolution needs a tiebreak

Forks make it unfixable rather than merely awkward: a contributor's `origin` **is their fork**, so
they cannot see Morpheus's branches at any resolution. There is no query that would tell them the
truth.

## The scheme

**New:** `MO-2026-08-01-15.26.34` — `PREFIX-YYYY-MM-DD-HH.MM.SS`, **in UTC**. Allocated from the clock, needing no
coordination and no network, which preserves the offline allocation `pm new` deliberately
supports. On local collision the seconds field bumps by one, so a fan-out gets `:34 :35 :36 :37`
— ordering preserved, deterministic, no randomness.

**Legacy:** `MO-2026-07-29-045` — the item's own `created:` date plus its old integer. This keeps
`grep MO-045` working against the git history, commit messages and merged PR bodies that cannot be
rewritten, and it preserves real chronology rather than collapsing every migrated item onto the
migration date.

**Filename:** `<id>-<slug>.md`, slug capped at **64** characters, cut at a hyphen boundary, and
generated preferring the shortest intelligible name — 64 is a ceiling, not a target. The slug is
deliberately **not** in the id: the timestamp already makes the id unique, so the slug's only job
is recognition when browsing, which is the filename's job. Keeping it out of the id keeps `prs:`,
`goal:` and cross-references short.

**Timezone is UTC, and that is load-bearing.** Ordering is the scheme's only job, and it is
meaningless if two authors measure from different origins: in local time an item written in Tokyo
at 09:00 (00:00 UTC) sorts *after* one written in Los Angeles at 18:00 the "previous" day (01:00
UTC). It also keeps the id consistent with `created:`, which is `toISOString()` and already UTC —
the first draft used local time and produced `id: MO-2026-08-01-17.30.00` beside
`created: 2026-08-02`, two different days in the same frontmatter.

**`baseSha:`** records **`HEAD`** at first write — the commit the author was actually on, not
`origin/main`. For an external contributor `origin` is *their fork*, and the field's whole purpose
is to say which version they were using when they hit the problem; recording upstream's tip would
assert they were on code they may never have run. Even internally, `origin/main` is a
remote-tracking ref reflecting the last fetch rather than what is checked out. More precise than a date for the question it
answers — *what did Morpheus look like when this was written* — and the reason an external
contributor's item is worth anything months later.

## Scope

Roadmap ids only. Goals (`MO-G-2026-Q3-01`) and requests (`MO-FR-007`) keep their schemes; they
are rare, written deliberately, and have never collided.

## This ships the mechanism, not the migration

`pm new`, `pm claim`, the schema, and a `pm migrate-ids` command, with Morpheus's own items left
on integers. Migrating all 80 items across six repos is a separate PR, run after the guidance
changes land, and it must prove that ordering is unchanged and nothing was lost.

## Test plan

The regex accepts both forms; `pm new` generates a timestamp id and bumps on collision; the slug
truncates at a word boundary and never exceeds 64; migration is order-preserving and reversible in
the sense that every old id remains derivable from the new one.
