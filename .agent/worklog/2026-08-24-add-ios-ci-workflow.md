---
agent: codex
date: 2026-08-24
roadmap: MO-26-08-24-01.08.19
outcome: complete
---

# Add reusable native iOS CI

## Changes

- Added a secret-free reusable workflow for a shared Xcode scheme on GitHub's macOS 26 image.
- Pinned the default contract to Xcode 26.6 and the iOS 26.5 iPhone 17 Pro Max simulator while
  keeping runner, toolchain, project, scheme, configuration, SDK, platform, destination, test plan,
  and build-only operation configurable.
- Required a committed `Package.resolved` and used Xcode's only-use-resolved flag for resolution,
  build, and test actions.
- Split build-for-testing from test-without-building, isolated Swift packages and DerivedData, and
  retained raw logs plus distinct build/test result bundles on failure.
- Added workflow contract tests and updated the architecture and settled tooling decision.

## Build-vs-borrow

Considered `maxim-lobanov/setup-xcode`, a maintained action with three runtime dependencies. The
workflow instead validates the hosted runner's documented exact app path and exports
`DEVELOPER_DIR`; that small operation does not justify extending every consumer's CI trust path.

## Verification

- `pnpm typecheck`
- `pnpm vitest run tests/workflows.test.ts` — 88 tests passed
- `pnpm vitest run --maxWorkers=1` — 975 tests passed
- `pnpm compile`
- `pnpm morpheus pm index` — every index unchanged/current
- `pnpm morpheus pm validate` — 118 roadmap items, one goal, zero requests valid
- `actionlint` 1.7.12, Ruby YAML parse, and `git diff --check`

Live execution of the reusable caller contract follows in Evo immediately after this parent
workflow reaches `main`; Morpheus itself has no Xcode project to run.

## Dead ends

The first `actionlint` pass caught that the `runner` expression context is unavailable in a job's
top-level `env`. The workflow now derives all isolated paths from the shell's `RUNNER_TEMP`, exports
them through `GITHUB_ENV`, and uses `runner.temp` only in step-level action inputs where GitHub
allows it.

The first full suite run used Vitest's default parallelism while other overnight work was compiling
in the same host. Two unrelated tests hit their 30-second limits after the machine became heavily
contended. Each passed alone in under two seconds, and the complete suite then passed serially in
11.5 seconds. No timeout or source change was needed.
