# Reject repository Markdown in dynamic HQ traces

## Mandate

- **Outcome:** make deploy-time-only repository content a permanent Morpheus invariant, then use
  the corrected contract for the remaining project migrations.
- **Acceptance:** the reusable guard rejects Markdown anywhere under a project's canonical checkout,
  while dependency and out-of-checkout Markdown remain excluded; source, generated distribution,
  tests, architecture, and runbook agree; independent review and CI clear the exact change.
- **Authority:** Chris authorized implementation across Morpheus and the outstanding projects,
  including normal production Vercel deploys and verification. Repository review, CI, and protected
  branches remain in force.
- **Budget:** no new paid service or discretionary provider spend; use existing subscriptions and
  included CI/Vercel capacity only.
- **Reporting/stop:** report milestones, decisions, or completion; stop when the permanent contract
  and every named downstream production migration are verified.

## Why

The first reusable guard treated only `hq/` as repository content. Enterprises review demonstrated
that a dynamic route could instead trace a root README, `.agent` record, or engineering document
without failing. The contract is about when repository Markdown is read, not which folder owns it.

Codebase-memory discovery was attempted first, but the active MCP transport was closed. Exact
source reads and literal search were used as the documented fallback; no negative graph claim is
made.

## Changes

- Canonicalize the checkout root and recognize every in-repository Markdown trace.
- Exclude any path beneath `node_modules` and any path outside the checkout.
- Exercise root, `.agent`, `docs`, `hq`, dependency, and external-path boundaries in the generated
  checker test.
- Align the architecture and website migration runbook with the repository-wide boundary.

## Verification

- `pnpm exec vitest run tests/web-scaffold.test.ts` — 33 tests passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm compile` — passed and refreshed committed `dist/`.
- `pnpm morpheus pm index` — indexes were current.
