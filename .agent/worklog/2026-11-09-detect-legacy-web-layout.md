---
roadmap: MO-26-11-09-09.59.47
date: 2026-11-09
tags: [engineering]
---
# Detect established web layouts

Issue #433: the shared survey selected a missing `apps/web` instead of an existing `web/` Next.js application. It now recognizes `web/app` with a Next.js dependency after the existing canonical and root-level choices. The same survey steers status and scaffolding, so additions stay inside the existing site. No new option, dependency or generic discovery framework is needed; this is a small domain-specific path extension. No early diagram is needed for this single-function correction.

## Validation

- Initial regression failed: the legacy app, HQ, gate, alias and test runner were all reported missing.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm exec vitest run tests/web-scaffold.test.ts tests/consumer-auth.test.ts`: 70 passed, including legacy in-place scaffolding, unchanged HQ bytes, absence of a second app, precedence and invalid-directory cases.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`: passed. Removed unrelated declaration-order churn produced by this Node/compiler environment.
- `morpheus complexity check`: passes enforced CCN 15; seven touched functions, 80 measured functions in two files; no new finding. Hand inspection confirms one fixed candidate loop reuses existing detection.
- Read-only built-code survey against the reported consumer finds `webRoot: web`, app/HQ/gate present. No consumer files or cloud resources changed.
- `pnpm test` ran once: 4,275 passed, two skipped, six failures exclusively from absent `actionlint`. Installed pinned actionlint 1.7.12 in ignored operational tools; the affected `tests/workflow-expressions.test.ts` then passed all seven tests. No unchanged full-suite rerun.
- `pnpm lint` and `git diff --check`: passed.

## Independent review

Pending.
