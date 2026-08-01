---
id: MO-26-07-28-004
title: "/hq auth: Firebase custom claims"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [48]
created: 2026-07-28
updated: 2026-08-01
---

> Migrated from `MO-004` to `MO-26-07-28-004` (MO-057). References to `MO-004` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

`role: employee | investor | admin` as custom claims, gating both the route
(middleware) and the data (Firestore rules) from one fact. Plus `morpheus sync-access`
applying the manifest allowlist via the Admin SDK, so granting access is a pull request.

Must land before more `/hq` surface exists — retrofitting auth is materially harder
than starting with it.
