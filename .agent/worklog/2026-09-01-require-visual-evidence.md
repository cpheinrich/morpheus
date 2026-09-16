---
agent: codex
date: 2026-09-01
roadmap: MO-26-09-01-01.23.22
outcome: review
---

# Require visual evidence for front-end pull requests

## What changed

- Added a default-on `review.visualEvidence` manifest contract with explicit include/exclude globs
  for React, Swift/SwiftUI, assets, and shared design tokens.
- Made matching paths block unless `## Visual evidence` contains a stable GitHub attachment. A
  labeled recording is preferred; screenshots pass with a warning.
- Kept pixel semantics outside CI: the checker does not fetch an attachment or decide whether it
  meaningfully demonstrates the change. Front-end-looking paths outside the contract and legacy
  manifests without the block warn only.
- Added an opt-out that requires a substantive repository-owned reason. Morpheus uses it because it
  has no rendered product surface; Evo is the first blocking consumer rollout.
- Updated the initializer, project instructions, pull-request template, architecture, and committed
  CLI output so new projects inherit the rule and established manifests gain it additively when
  `morpheus init` is rerun.

## Build vs. borrow

The registry check found `minimatch` 10.2.6, published 2026-07-27 with bundled TypeScript types and
one direct dependency. It was adopted instead of inventing glob syntax; the policy layer adds the
repository-specific validation and evidence semantics.

## Verification

- Focused check and scaffold suites: 2 files, 150 tests passed.
- Full suite: 37 files, 1,032 tests passed.
- TypeScript typecheck and compile passed; compile refreshed committed `dist/`.
- `pnpm lint` could not run because the repository declares the script but does not install
  `eslint`; no lint dependency was added as an unrelated side effect.
- The exact-checkout codebase-memory service closed its transport during indexing, so source
  fallback was used for the current worktree after the stale graph was rejected.
