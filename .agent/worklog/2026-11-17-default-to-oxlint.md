---
date: 2026-11-17
roadmap: MO-26-11-17-01.05.07
tags: [engineering, devops]
summary: Make Oxlint the Morpheus JavaScript and TypeScript lint default.
---

# Default Morpheus lint to Oxlint

The [CI pilot](../../docs/ci-speed.md) measured ESLint and Oxlint on the same
source. Used the migrator's explicit rules for the root lint scope and replaced
the ESLint version test with executable examples that assert diagnostics.
Fresh Next.js apps get an app-local config and lint script. Existing apps
keep control of their lint files through scaffolding. Shared CI continues to
invoke the caller's script.

The first install selected 1.94.0 and proposed minimum-release-age exemptions
for the native packages. Pinned 1.93.0 and regenerated the lock from the original
lockfile under the current policy. No new policy exemptions were needed.
The first review also linted optional consumer-auth output. Kept the scaffold's
valid status roles and scoped the control-character regex exception to
`lib/auth/safe-next.ts`, where it intentionally rejects unsafe URLs.

## Verification

- `pnpm lint`
- `pnpm exec vitest run tests/lint-contract.test.ts tests/web-scaffold.test.ts tests/consumer-auth.test.ts tests/web-provision.test.ts tests/profile/classify.test.ts tests/workflows.test.ts` passed 345 tests covering lint, generated apps, optional consumer auth, and the workflow callers.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and `morpheus complexity check` passed.
- The full suite runs through the required Node job on GitHub.
