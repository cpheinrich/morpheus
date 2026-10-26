---
roadmap: MO-26-10-26-12.12.30
tags: [engineering]
---

# Reject mutating explicit ship checks

Issue #421: the explicit-ID path in `pm ship` ignored `--check`. A real temporary
roadmap fixture reproduced both a successful mutation and a partial mutation before
an unknown second ID failed. Both regression cases failed on the original code.

Reject this combination before the item loop; the issue explicitly allows this
resolution. No-ID `pm ship --check` remains a merged-PR drift report. Deliberate
`pm ship <ID>` remains available. The help and PM runbook state both supported forms.
The correction uses an existing domain-specific CLI guard; no package or generic
module is needed.

Tier 2 graph verification used the primary checkout at the identical base,
generation 2026-10-26T18:59:37Z. `ship` calls `markShipped` and `reconcile` and is
called from the PM dispatcher. Coverage reported no recorded gaps for the relevant
CLI, ship, help, dispatcher, tests and runbook paths; this is best-effort evidence.
The branch changes were read directly after editing, because the primary graph
does not index this branch's new source.

## Validation

- `pnpm install --frozen-lockfile` passed.
- `pnpm exec vitest run tests/ship.test.ts tests/cli-dispatch.test.ts`: 127 passed.
  Real-file assertions preserve complete bytes and PR metadata; multiple IDs and
  both flag positions are covered. Manual shipping still updates the expected status.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and `git diff --check` passed.
- Full `pnpm test` ran once as requested: 3302 passed across 115 files in 140.12s.
  The verified actionlint 1.7.12 binary was on PATH. Independent review follows.
