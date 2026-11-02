---
roadmap: MO-26-11-02-13.16.08
date: 2026-11-02
agent: codex
outcome: completed
tags: [engineering, product]
---
# Prefer exact HQ record identities

## Result

Issue #478's punctuated roadmap ID becomes independent numeric tokens in MiniSearch. A
numeric-heavy inbox or body mention can therefore outrank the record, especially with the
ordinary roadmap-history weight. Reproduced with the exact reported LK-26-08-28-13.52.42 ID
and 42.02%/42.96% values; nine regressions failed on the original implementation.

Default ranking now puts complete title/path/filename identities and complete roadmap IDs
at the filename boundary first, before the result limit. It uses the existing canonical
roadmap grammar, including legacy forms. Partial IDs and body mentions retain ordinary
scores. Explicit project ranking callbacks retain full control. Existing serialized indexes
remain compatible. No UI layout, catalogue, permissions, consumer pin or deployment changes.

## Validation

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint` passed. Focused
`pnpm exec vitest run tests/hq-search.test.ts` passed 19 tests, including serialized reload,
lowercase/whitespace, legacy IDs, exact title/path names, result limits, partial identifiers,
ordinary topic weighting and custom ranking. `pnpm compile`, `pnpm morpheus pm index`
and `git diff --check` passed. One full `pnpm test` passed 4,141 tests in 138 files in
114.86 seconds (the branch before integration of separately validated waiter PR580).

Graph tools were unavailable and bootstrap could not safely stop other active sessions.
Direct source inspection covered the shared search engine, builder, browser callers and
Lakina's real-catalog integration contract. No graph-completeness claim is made.
