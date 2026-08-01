---
id: MO-26-07-29-023
title: "Brand refresh leaves derived files stale"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [14]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-023` to `MO-26-07-29-023` (MO-057). References to `MO-023` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

From [issue #12](https://github.com/cpheinrich/morpheus/issues/12), part 1. **This is a bug, not an
enhancement.**

`generateBrand` always rewrites `answers.json` but skips every other existing file. So a refresh
can change the mission in `answers.json` while `strategy.md`, `voice.md`, `messaging.json` and
`explore-prompt.md` still carry the old one — and the CLI reports success. `messaging.json` is
imported by the web app, so the stale value ships.

The non-destructive rule is right. Treating generated and hand-edited files identically is what is
wrong.

## Approach

`PackageEntry` already carries `source: "wizard" | "session"`. Extend it to ownership:

| Ownership | Files | Refresh behaviour |
|---|---|---|
| `derived` | `messaging.json`, `explore-prompt.md`, `README.md` | Regenerate silently. Nothing hand-written legitimately survives in them. |
| `seeded` | `strategy.md`, `voice.md`, `visual-system.md` | Generated once, then human-owned. Show a diff; apply only on request. |
| `authored` | `tokens.json`, `assets/*` | Never touched by refresh. |

`morpheus brand refresh --check` reports drift and writes nothing, so CI can catch a package whose
prose disagrees with its answers.

**If safe regeneration is impossible, fail and name the stale files.** Reporting a successful
refresh that left the old mission in place is the failure mode being fixed; a quieter version of it
is not an improvement.

## Test

Generate, change the mission, refresh, and assert the package cannot contain both missions without
reporting a conflict.
