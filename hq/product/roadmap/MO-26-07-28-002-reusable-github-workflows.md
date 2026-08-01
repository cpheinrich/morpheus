---
id: MO-26-07-28-002
title: Reusable GitHub workflows
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: []
created: 2026-07-28
updated: 2026-07-29
---

> Migrated from `MO-002` to `MO-26-07-28-002` (MO-057). References to `MO-002` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

Workflows with `on: workflow_call` that every project delegates to: `node-ci`
(lint, typecheck, test), `pr-check` (the enforcement gate), and later `web-ci`,
`ios-ci`, `deploy`.

Highest value per hour of anything in stage 1 — it needs no package publishing and
improves CI for every repo from one commit.
