---
id: MO-26-07-28-006
title: "kit/analytics: PostHog setup and event schema"
status: in-progress
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: []
created: 2026-07-28
updated: 2026-08-11
---

> Migrated from `MO-006` to `MO-26-07-28-006` (MO-057). References to `MO-006` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

Client initialisation for web and iOS, a canonical event schema, and the `/hq`
KPI tiles that read it. Two consumers already (Darwin and Evo), and the event schema
is the expensive thing to get wrong later.
