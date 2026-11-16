---
agent: codex
date: 2026-11-16
roadmap: MO-26-11-16-14.00.31
outcome: review
tags: [engineering, security]
---

# Remediate root dev dependency advisories

## Initial draft mandate and verification

The sections before the backlog triage follow-up describe the original draft.

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
change. Draft pull request [#728](https://github.com/cpheinrich/morpheus/pull/728) is the focused
review vehicle.

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

## Backlog triage follow-up

Chris authorized continued delivery and closure of Morpheus PRs. The root lockfile still resolved
minimatch 10.2.6 from three lint dependencies. The Security App's #704 candidate was behind
protected main. The controller applied its exact narrow `minimatch@10.2.6: 11.0.1` workspace
override and lockfile hunk to this already open root dependency draft and retested the combined
change. This stays in the ordinary independently reviewed lane.

On the combined tree, frozen install and all four package manifest and lint contract tests passed.
Lint, typecheck, compile, PM index and validation, complexity, and diff checks passed. The root
full audit and production audit both returned zero advisories. No source or production manifest
changes were required.

## Independent review

Independent Factory review cleared the root dependency update and verified npm integrity, matching Vitest packages, the compatible Firebase re2js resolution and the unchanged minimatch patch from #704. It independently confirmed clean full and production root audits, a frozen install, lint and four package contract tests. The initial draft mandate is historical. After protected delivery of this combined PR, the controller will close #704 as superseded.

```morpheus-review
{
  "version": 2,
  "base": "0bcbc251cbfd12cc8215c922b51dda180447ebab",
  "reviewed": "31421af2bcb0e89d00a83d75d62dbcfbff03ae2a",
  "covered": "31421af2bcb0e89d00a83d75d62dbcfbff03ae2a",
  "authorSession": "01a1e65c-0355-76c1-8402-a96d3e0a8c43",
  "reviewerSession": "8ad62665-b94f-4e38-8a00-f2189df283a0",
  "risk": "normal",
  "elapsedMinutes": 1.8328,
  "timing": {
    "source": "runner",
    "durationMs": 109968,
    "evidence": "Claude result duration_ms=109968 in Factory run e77c0c1e-50b3-4965-8d0d-9454e90b8a5f events.jsonl."
  },
  "outcome": "complete",
  "summary": "Independent Factory review cleared the root dependency update and verified npm integrity, matching Vitest packages, the compatible Firebase re2js resolution and the unchanged minimatch patch from #704. It independently confirmed clean full and production root audits, a frozen install, lint and four package contract tests. The initial draft mandate is historical. After protected delivery of this combined PR, the controller will close #704 as superseded.",
  "contextRead": [
    "CLAUDE.md",
    "hq/product/roadmap/MO-26-11-16-14.00.31-remediate-root-dev-deps.md",
    "docs/runbooks/osv-maintenance.md",
    ".agent/worklog/2026-09-10-weekly-osv-remediation.md",
    ".agent/worklog/2026-09-25-extract-security-remediation.md",
    ".agent/worklog/2026-11-16-remediate-root-dev-deps.md"
  ],
  "findings": [
    {
      "id": "N01",
      "severity": "minor",
      "description": "The earlier worklog described the pre-triage draft scope and audit numbers.",
      "paths": [
        ".agent/worklog/2026-11-16-remediate-root-dev-deps.md"
      ],
      "disposition": "fixed",
      "response": "Label the initial material as historical and keep the integrated evidence in the backlog triage section."
    },
    {
      "id": "N02",
      "severity": "minor",
      "description": "The reference to #704 did not explicitly state its closure sequence.",
      "paths": [
        "hq/product/roadmap/MO-26-11-16-14.00.31-remediate-root-dev-deps.md"
      ],
      "disposition": "fixed",
      "response": "State the closure sequence in the PR body. After protected delivery, close #704 as superseded and verify the GitHub state."
    }
  ]
}
```
