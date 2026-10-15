---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.37.24
outcome: review
summary: Support distinct production build identity in iOS QA modes and verify the built bundle before installation.
---

# iOS QA mode build identity

Morpheus #388 arose when Evo needed production QA but the shared preview's
single build command, product path and bundle ID still selected staging. Evo
could only proceed by temporarily replacing its QA configuration in an
isolated checkout.

The preview now accepts all three fields on a mode. It rejects partial
overrides, so changing just the bundle ID cannot silently reuse a staging
product. It reads the built app's `CFBundleIdentifier` before install,
including when `--no-build` selects an existing product. Status and stop
identify the mode and bundle recorded at start. The shared simulator, lease
and overlay lifecycle is unchanged.

Focused validation: `pnpm exec vitest run tests/qa-preview.test.ts
tests/qa-comments.test.ts` passed 73 tests, covering config validation,
production selection, bundle mismatch refusal, reporting and the direct QA
comments dependent. `pnpm typecheck`, `pnpm lint`, `pnpm compile`, and
`pnpm morpheus pm index` passed. No local full suite was run because this
change is confined to the QA preview path; CI runs it on the PR.

Codebase-memory could not activate because active sessions could not be
stopped safely. I used targeted source and test inspection instead.
