---
agent: codex
date: 2026-11-16
roadmap: MO-26-11-16-14.00.31
outcome: review
tags: [engineering, security]
---

# Remediate root dev dependency advisories

## Mandate

- Outcome: clear the root development advisories that have no existing remediation vehicle,
  without combining them with the weekly audit or the existing minimatch pull request.
- Acceptance: Vitest resolves the first fully patched 4.1.12 release; Firebase's compatible re2js
  range resolves a patched release; root full audit leaves only #704's minimatch finding; root
  production audit remains clean; focused validation passes; a governed draft is open.
- Authority: reversible repository and pull-request mutations for this focused remediation only;
  do not merge, enable auto-merge, close pull requests, deploy, dispatch workflows, create
  credentials, change security policy, or spend money.
- Budget: existing local subscription and included CI only; no new spend.
- Stop: the focused draft is open with review-ready evidence, or a precise blocker is recorded.

## Evidence and implementation

At exact `origin/main` `3a0ce4ab21dc4eaa7ede61224b7c2b7bb709958e`, `pnpm audit --json`
reported one high and three moderate findings. Existing security PR #704 owns the minimatch
moderate. Vitest 4.1.11 contributed two `@vitest/mocker` moderates fixed in 4.1.12. Firebase's
declared `re2js` range had retained 2.8.6, which contributed the high finding; the range accepts
the current 2.10.0 release without an override or parent upgrade.

The implementation advances direct Vitest within its existing v4 line to 4.1.12 and regenerates
the lockfile, which also selects re2js 2.10.0 through Firebase's existing compatible range. It
does not add an override, alter production dependencies, or absorb #704's independent minimatch
change.

## Validation

- `pnpm install --frozen-lockfile` passed with Vitest 4.1.12.
- `pnpm audit --json` now reports one moderate minimatch finding, owned by #704; high, critical,
  low, and all other moderate counts are zero.
- `pnpm audit --prod --json` reports zero advisories.
- `pnpm exec vitest run tests/package-manifest.test.ts tests/lint-contract.test.ts` passes four
  tests under Vitest 4.1.12.
- `pnpm lint`, `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`,
  `pnpm morpheus pm validate`, and `git diff --check` pass.
- `morpheus complexity check` passes with no measured function; this branch changes only records,
  package metadata, and the lockfile.

Fresh independent review remains pending while the pull request is deliberately a draft. The
full suite was not run locally because no shared core source changed; exact-head CI owns that
backstop.
