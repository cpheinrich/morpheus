---
agent: codex
date: 2026-11-02
roadmap: MO-26-11-02-10.09.34
outcome: review
tags: [engineering, devops, security]
---

# Weekly code-health audit

## Mandate

- Outcome: deliver the current Morpheus codebase-wide technical-health review and coherent safe
  cleanup, with disruptive remediation isolated for review.
- Acceptance: a dated marked main audit PR with ranked evidence/confidence/impact/action, safe
  cleanup implemented, focused remediation drafts linked, proportional validation, and a fresh
  independent-review packet; all PRs stay open with auto-merge disabled.
- Authority: change this governed audit branch and refresh the exact existing remediation PRs;
  do not merge, enable auto-merge, close work, dispatch workflows, deploy, create credentials,
  access live production data, or bypass repository governance.
- Budget: existing local subscription and included CI only; no new spend.
- Stop: acceptance or a precise blocker after safe alternatives are exhausted.

## Audit evidence

Audited exact `origin/main` `ae147cb6a1c296c239a4d25098c3211d1f6c6f25` across root and
nested production graphs, dead code and dependencies, tracked artifacts/assets, duplication,
structural hotspots, tests/CI, and governance.

- Reused Factory PR #576. Added Zod 4.6.6 and regenerated its lockfile after the existing SDK
  update; patched body-parser/Hono/node-server/IP/qs/fast-uri transitives now resolve, 134 tests
  and package checks pass, and its production audit is clean.
- Refreshed root Zod PR #464 through current main, regenerated the new meeting-intake declaration,
  and passed typecheck, lint, compile, PM index, and 118 focused tests. The Zod high finding is
  absent; root minimatch remained explicitly separate.
- Refreshed Paperclip Zod PR #513 through current main. Frozen install, standalone build, and
  package-boundary check pass; its high Zod finding is absent and three moderate upstream
  transitive findings remain explicit.
- Reused minimatch PR #570, merged current main, and validated the preserved public matcher API
  through typecheck, lint, compile, PM index, and 127 checker tests.
- Converted #576 and #570 to drafts; #464 and #513 were already drafts. Added `codex` and
  `codex-automation` labels. All four have `autoMergeRequest: null`.

## Safe audit-branch cleanup

Removed obsolete `@types/js-yaml@4.0.9`. Direct package evidence proves `js-yaml@5.4.1` publishes
and exports its own declaration file. The root lockfile removes only that package. No other
deletion met the direct-consumer evidence bar.

## Analysis

- `jscpd@5.4.2`: 293 files, 43 clones, 435 duplicated lines (0.63%). The leading Factory and CD
  clones span distinct authority/state transitions, so a behavior-changing consolidation is not
  safe in this audit. A focused refactor is blocked until tests pin both sides of each proposed
  extraction; no finding is represented as fixed.
- Knip: no unused production dependency, unlisted dependency, or unresolved import. Firebase CLI
  and Firestore rules candidates are directly used. Multi-entry/generated-file findings were
  treated as candidates only.
- Tracked tree: 2,361 files, no tracked junk/recovery artifacts, and one documented/referenced
  media asset.
- Hosted evidence: exact-main CI and Paperclip workflows and the latest hourly schedule are green;
  strict main protection requires the four expected checks.
- Graph: current-main generation 2026-10-31, 13,712 nodes / 45,655 edges, no skipped files. Direct
  source fallback covered the reported embedded-template ranges and twelve test-file gaps. Exact
  worktree activation was unavailable because other active graph sessions prevented a safe server
  restart, so negative claims remain bounded and this limitation is explicit in the report.

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index`,
  `pnpm morpheus pm validate`, `pnpm morpheus team validate`,
  `pnpm morpheus inbox validate`, and `git diff --check` pass.
- The exact focused command was `pnpm exec vitest run tests/workflows.test.ts
  tests/ios-change-scope.test.ts tests/ios-runner-labels.test.ts tests/init.test.ts
  tests/lint-contract.test.ts tests/workflow-expressions.test.ts
  tests/ios-build-cache.test.ts tests/upload-configuration.test.ts tests/ci-scope.test.ts
  tests/ios-nightly-recovery.test.ts tests/ios-evidence-workflow.test.ts
  tests/firebase-release.test.ts tests/upload-receipt.test.ts tests/ios-test-retry.test.ts
  tests/artifact-workflows.test.ts`. Fourteen files pass 429 tests after removing
  `@types/js-yaml`.
  `tests/workflow-expressions.test.ts` could not run its six actionlint-backed cases because
  actionlint 1.7.12 is not installed on this host (`spawnSync actionlint ENOENT`). The failure is
  environmental and precedes expression evaluation; exact-head CI downloads the checksum-pinned
  binary and owns that verification. The suite was not repeated unchanged.
- Exact-head CI and a fresh independent reviewer remain required before the main audit PR can be
  non-draft.

## Remediation links

- #576: https://github.com/cpheinrich/morpheus/pull/576
- #464: https://github.com/cpheinrich/morpheus/pull/464
- #513: https://github.com/cpheinrich/morpheus/pull/513
- #570: https://github.com/cpheinrich/morpheus/pull/570
