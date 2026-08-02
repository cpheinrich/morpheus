---
date: 2026-08-02
agent: claude
roadmap: MO-26-08-02-03.16.10
outcome: shipped
summary: pm index died with a bare ENOENT when a kind's directory was absent, because reading tolerated absence and writing assumed presence.
---

## What happened

Found from Darwin. It moved goals to `hq/strategy/goals/` — a company has goals that are not
product goals — which left `hq/product/goals/` absent.

`pm validate` was untroubled: `parseDir` returns `[]` for a missing directory, so it printed
`✓ Goals — 0 item(s)`. `pm index` walked the same kinds and called `writeIndex` on each, and
`writeFile` cannot create a parent directory. `ENOENT`, exit 1, from `index` and `index --check`
alike — which is the step `pm-check.yml` runs, so Darwin's CI went red.

**The two halves disagreed about whether a kind must exist.** Reading tolerated absence; writing
assumed presence. That asymmetry is the bug, not the missing directory.

## Skip, don't mkdir

The tempting one-liner is `mkdir -p` before writing. It makes the command pass and it is wrong:
the project would acquire an empty `goals/` directory by the act of indexing, and it would come
back every run after anyone deleted it. A project that does not use a kind should not gain one as
a side effect of a read-only-sounding command.

## The tests are the part worth keeping

Both new cases fail with the exact production ENOENT when the guard is disabled — checked by
disabling it rather than assumed, because a test that cannot fail looks identical to one that
passes.

The `--check` case exists separately because that is the path CI actually takes, and it has an
extra way to be wrong: crashing *before* it can report staleness looks the same from outside as
reporting stale.

## Left open deliberately

Darwin's goals are now unvalidated by `pm validate`, since they sit outside the product directory.
The real question underneath is **whether goals belong under `hq/product/` at all** — every
`kind: company` project has company-level goals, and filing them under "product" is a wart in the
shared structure rather than in one consumer. That wants its own item; smuggling a layout decision
in behind a crash fix is how conventions drift.
