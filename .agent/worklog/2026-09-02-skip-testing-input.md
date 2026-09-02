---
agent: claude
date: 2026-09-02
roadmap: MO-26-09-02-00.22.48
outcome: review
---

# Add skip-testing input to ios-ci for nightly-only tests

## What changed

`ios-ci.yml` gained `skip-testing` (default empty): newline-separated `xcodebuild -skip-testing:`
identifiers, applied only to the "Run unit and UI tests" step. `build-for-testing` compiles the
whole scheme regardless of which subset will execute, so a build-time exclusion is a no-op there —
verified via a new test asserting `SKIP_TESTING` never appears on that step.

## Why

Evo's per-PR suite spent real time on `EvoUITestsLaunchTests.testLaunchPerformance`, an
`XCTMeasureOptions` launch benchmark that runs six times per invocation (three iterations, twice
over via `runsForEachTargetApplicationUIConfiguration`). A launch-speed regression is fine to catch
nightly; it should not gate every pull request. `ios-nightly-build.yml` does not forward this
input, so its own caller of `ios-ci.yml` runs the full scheme by omission — no plumbing needed on
the nightly side.

## Verification

- Full suite: 37 files, 1,051 tests passed. `tsc --noEmit` clean.
- New test covers: default empty, `SKIP_TESTING` env wired to the run step only, the
  `-skip-testing:` argument construction, and the read-loop that splits the newline-separated list.
