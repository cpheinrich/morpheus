---
id: MO-26-07-29-037
title: "brand check reports clean when nothing has been generated"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [30]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-037` to `MO-26-07-29-037` (MO-057). References to `MO-037` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

Found checking Evo's brand state. Chris had filled in `answers.md` completely but never run
`morpheus brand build`, so `hq/brand/` held the answers and nothing else.

`brand check` reported **"✓ Every generated file matches answers.md."**

`checkDrift` skipped any file that did not exist, so zero files trivially matched. The command was
technically correct and practically a lie: it told someone their brand package was current when it
did not exist.

## Shipped

Absence is now its own answer. `checkDrift` returns `missing`, and `brand check` reports it with
the fix:

```
answers.md is complete, but the package was never generated.
  hq/brand/README.md
  hq/brand/messaging.json
  ...
Run `morpheus brand build`.
```

## Fourth instance today

`tokens.json`, the `goal`/`inbox` detectors, `agents-md`, now this. Every one is a check that
treats "not there" as "nothing to say".
