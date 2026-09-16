---
agent: codex
date: 2026-09-01
roadmap: MO-26-09-01-20.10.53
outcome: review
---

# Speed up nightly iOS TestFlight builds

## What changed

- Renamed the reusable release workflow from `nightly-ios-build.yml` to
  `ios-nightly-build.yml` so it sorts beside `ios-ci.yml`.
- Made the release workflow default to the five-core M2 Pro `macos-26-xlarge` runner, parallel
  testing, and a six-worker simulator ceiling while preserving the separate gated upload job.
- Added a validated maximum-worker input to `ios-ci.yml` and forwarded it through both Xcode test
  phases without constraining Xcode's automatic build-operation scheduling.
- Updated architecture documentation and parsed-workflow regression coverage.

## Verification

- Full Morpheus suite: 37 files and 1,046 tests passed.
- Project records validated and generated indexes were current.
- `git diff --check` passed.
