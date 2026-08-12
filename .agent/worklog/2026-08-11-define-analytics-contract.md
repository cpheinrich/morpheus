---
date: 2026-08-11
roadmap: MO-26-07-28-006
---

# Define the analytics event contract

Settled the previously open analytics-schema question using Evo as the first production consumer.
Product vocabulary belongs to each project's `packages/shared/schema/analytics.ts`, while PostHog
and other transports stay in apps. Universal event names were rejected because `activation` or
`purchase` can hide materially different product meanings; cross-project KPIs will use explicit
mappings instead.

`morpheus init` now writes a dependency-free contract for company and personal projects, never
overwrites an existing schema, and leaves internal tools alone. The scaffold defines schema,
surface and environment context plus event-level versioning, naming and sensitive-data rules.
Runtime adapters and `/hq/analytics` readers moved to MO-26-08-11-16.28.51, triggered only after a
second real implementation demonstrates what is shared.

## Verification

- `pnpm compile` regenerated the committed distribution.
- `pnpm exec vitest run --maxWorkers=1`: 803 tests passed across 27 files.
- `morpheus pm validate`: 88 roadmap items, one goal and zero requests valid.
- `morpheus pm index --check`: every generated index current.
- `git diff --check`: clean.
