---
agent: codex
date: 2026-09-02
roadmap: MO-26-09-02-12.23.59
outcome: review
---

# Keep iOS release secrets in caller environments

## What changed

- Exposed the nightly workflow's build decision and exact preflight-verified main SHA.
- Added a backward-compatible upload opt-out for cross-repository callers whose signing
  credentials are protected environment secrets.
- Documented that those callers must gate a local upload job on the reusable workflow outputs;
  repository-scoped secret inheritance is not an equivalent security boundary.
- Recorded GitHub's environment-secret boundary in issue #192, architecture, decisions, and
  learned facts.

## Verification

- Focused workflow suite: 105 tests passed.
- Full Morpheus suite: 37 files and 1,051 tests passed.
- TypeScript typecheck, roadmap validation, and `git diff --check` passed.
- Production reproduction: Evo run 33670770997 passed the reusable gate and showed all six Apple
  credentials empty only after entering the cross-repository upload job.
