---
id: MO-26-07-29-018
title: "Reusable workflows must not fight packageManager"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [7]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-018` to `MO-26-07-29-018` (MO-057). References to `MO-018` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

The Darwin retrofit failed CI on both jobs with:

```
Error: Multiple versions of pnpm specified
```

Darwin's root `package.json` declares `"packageManager": "pnpm@11.9.0+sha512..."`, and the
reusable workflows also passed `version` to `pnpm/action-setup`. Supplying both is an error.

**Evo never hit this because it has no `packageManager` field.** A convention that only breaks on
repos following a *stricter* practice than the template assumed — which is the worst kind, since
the better-maintained repo is the one that fails.

## Fix

`pnpm-version` defaults to empty in all four workflows, so `packageManager` decides. That is the
modern default and makes the lockfile-pinned version authoritative rather than a workflow input
that can silently disagree with it.

A project can still pass a version explicitly if it has no `packageManager` field.

## Pattern

Third template gap found by retrofitting rather than by design — after `web-ci` hard-failing on a
missing script and `pm-check` assuming the CLI was installed. All three shared a shape: **the
template encoded what Morpheus looks like rather than what a project looks like.**
