---
id: MO-26-07-29-015
title: "init must scaffold .agent and hq/inbox"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [22]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-015` to `MO-26-07-29-015` (MO-057). References to `MO-015` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

The Evo retrofit produced `hq/product/` but **no `hq/inbox/` and no `.agent/`** — both
conventions were invented after the retrofit ran. The gap only surfaced when Chris asked whether
to start a fresh session for Evo work: a fresh agent would have had no `decisions.md` to read.

That is the failure mode agent memory exists to prevent, so a project scaffolded without it
starts blind.

## What init must create

```
.agent/
├── README.md          how the four records relate
├── decisions.md       seeded with the project's own decisions, not empty
├── learned.md         seeded with what is non-obvious about this codebase
├── worklog/
└── inbox-archive/
hq/inbox/
├── README.md
└── <handle>.md        seeded from the wizard answers
```

**Seeded, not empty.** An empty `decisions.md` is worse than none — it reads as "nothing has been
decided" when the truth is "nobody wrote it down". `init` knows the answers from the wizard, so
it should write them.

## Git will not track an empty directory

`worklog/` and `inbox-archive/` were created with `mkdir` in the Evo scaffolding and shipped
**missing**, because git drops empty directories. `init` must write a README into each — which
is worth doing anyway, since a directory that explains what belongs in it is better than a
`.gitkeep`.

## Also

`morpheus add agent-memory` for retrofitting a project that predates the convention, which is
what Evo needed and got by hand.

---

## Reopened 2026-07-29

`pm ship` marked this shipped by matching PR #2, whose branch was `mo-015-empty-dirs`. That PR
added the missing directories **to Evo**; this item is a requirement on `morpheus init`, which does
not exist yet.

A worthwhile limitation to state plainly rather than engineer around: **reconciliation confirms that
a merged PR exists for an item, not that the item is done.** Nothing can confirm the second
automatically, and a tool that pretended to would be worse than one that occasionally needs
correcting by hand.

Folded into MO-008 as an acceptance criterion.
