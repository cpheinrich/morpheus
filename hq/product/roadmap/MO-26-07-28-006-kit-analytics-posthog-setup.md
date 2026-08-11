---
id: MO-26-07-28-006
title: "kit/analytics: PostHog setup and event schema"
status: review
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

Settle the canonical analytics boundary and scaffold it into user-facing Morpheus projects.

The product-owned, provider-neutral contract lives at
`packages/shared/schema/analytics.ts`; transports remain inside each consuming app. The scaffold
defines common context, event naming, explicit property allowlists, versioning, and sensitive-data
exclusions without adding a runtime dependency or overwriting an existing contract.

Runtime SDK adapters, schema generation for non-TypeScript clients, and `/hq/analytics` KPI readers
remain deferred until a second real implementation proves what is genuinely shared. Evo is the
first implementation and validation of this contract.
