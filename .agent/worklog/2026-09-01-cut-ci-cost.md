---
agent: claude
date: 2026-09-01
roadmap: MO-26-09-01-21.16.01
outcome: review
---

# Cut CI cost and restore iOS headroom

## What changed

- `ios-ci.yml` passes `COMPILER_INDEX_STORE_ENABLE=NO` to `build-for-testing` and `build`. The
  override stays off `test-without-building`, which compiles nothing and re-quotes its arguments
  into the Firebase emulator exec string.
- The SourcePackages cache gained a prefix `restore-keys`, so a one-dependency bump reuses the
  unchanged checkouts instead of re-cloning every package.
- The test job's concurrency group now names the calling workflow, so a release workflow calling
  this job on `refs/heads/main` cannot cancel — or be cancelled by — a push-to-main CI run.
- `web-ci.yml`, `pm-check.yml`, `pr-check.yml` and the `emulators` job in `firebase-tests.yml`
  gained a `timeout-minutes` ceiling; the first three also gained a job-level concurrency group.

## Measurements behind it

Taken from Evo, the only repository with a native iOS surface. Across its last thirty `ios-ci`
runs, roughly five hundred billed macOS minutes; every Linux workflow together costs a couple of
dollars a month. One successful run, 28m13s against the thirty-minute ceiling:
`build-for-testing` 2m57s, unit tests 3m31s, UI tests 19m27s. Several runs already report as
cancelled at exactly thirty-one minutes, which is that ceiling firing. The run log confirms
`-index-store-path` was being passed to every compile.

## Verification

- Full suite: 37 files, 1,049 tests passed.
- Three new assertions cover the changes; the timeout assertion was negative-checked by deleting
  `web-ci.yml`'s ceiling and confirming it fails.
- Bash array literals with an inline comment were checked directly — the comment is stripped and
  the build-setting argument survives.

## Not done here

- Whether a caller should enable parallel testing is the caller's decision, and `ios-ci.yml`'s
  own default stays `false`.
- The largest remaining cost is Evo's serial UI suite, which belongs to Evo.

## Follow-up: optimize-test-build (2026-09-02)

Added after Evo profiled a Debug-vs-Release-optimization-level question on its own PR. A real
Release build's compiler invocations were grepped (not assumed from the project file — Release has
no explicit `SWIFT_OPTIMIZATION_LEVEL` line, and an unset setting can still carry an Xcode-internal
default keyed to the configuration's name): `-O` for Swift, `-Os` for C/Objective-C, whole-module
compilation. `optimize-test-build` (default `false`) passes those as command-line overrides on both
build actions, which reaches only that `xcodebuild` invocation — a caller's own Debug configuration
in the project file, and a developer's local Xcode build, are untouched either way.

Measured on Evo with it enabled: the build itself got faster (2m57s → 1m32s), not slower, and every
UI test exercising real rendering work ran faster too — `-Onone` was costing more in per-file
compile overhead than whole-module optimization added back, and the app's own compute-heavy screens
render measurably faster once optimized. Combined with two parallel workers and Evo's own
reduce-motion default, total suite time went 28m13s → 18m25s with 134/134 tests passing.
