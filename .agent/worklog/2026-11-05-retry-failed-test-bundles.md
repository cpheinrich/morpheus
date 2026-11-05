---
date: 2026-11-05
roadmap: MO-26-11-05-01.48.10
tags: [engineering, devops, ios, ci]
---

# Retry a failed test bundle's selected tests, not its placeholder

A consumer's staging delivery failed its simulator tests although the retry looked healthy. The
unit bundle's test runner could not launch on attempt 1 (SpringBoard refused the app: "Busy,
Application failed preflight checks"). Xcode then records no unit results at all, only a
placeholder `Test Case` named "<App> encountered an error" under a `System Failures` suite, with
"Failed to install or launch the test runner". `scripts/ios-test-retry.py` read that placeholder
as a test id and retried `-only-testing:<UnitBundle>/<App> encountered an error`. Xcode selected
nothing, ran zero unit tests and exited 0 on attempts 2 and 3, so the "test" never passed, the
job failed with a fictional id, and the caller's verifier found every unit result missing. The
same run's UI tests failed attempt 1 the same way and passed after the simulator erase, so this
is the retry classification, not the host.

## What changed

- `read_results` separates a bundle that could not start from real failures by structure: a
  `Test Case` whose identifier is not `Class/method()` (no `/`). It reports such bundles as
  `broken`; a summary failure naming one is attributed only when the tree has that bundle's
  placeholder, so anything else still fails closed.
- A broken bundle's retry selection is the caller's `ONLY_TESTING` entries inside that bundle, or
  the bundle itself when the caller selected everything. A caller that selected nothing in it is
  an error, never an empty (= everything) selection. Every retry now also carries the caller's
  `SKIP_TESTING`; previously skips were dropped on retries, harmless for single test ids but
  wrong once a whole bundle or class is selected.
- The bundle counts as running again only when a retry has results for its tests and no
  placeholder. Zero tests is still broken, whatever the exit status. Failures among its newly run
  tests join the ordinary per-test retry.
- `test-attempts.json` gains `failedBundles` (per attempt and overall), `bundles` on a retry that
  selected one, and `recoveredBundles`; `flaky`/`failed`/`flaky-tests` stay real test ids.
- When everything recovered, `tests.json`/`summary.json` replace the bundle's attempt-1 node with
  the node from the retry that ran it, and the summary counts gain those tests, so a caller's
  validator that expects the full unit set sees it. Attempt counts and caller policy are
  unchanged.

Not added: a warm-up, a boot gate, a new option, or a generic retry package. This stays the
existing domain helper.

## Tests and mutants

The fake `xcodebuild` now models `-only-testing`/`-skip-testing` the way Xcode matches them
(an entry covers itself, everything below it and a method named without parentheses) and can make
a bundle fail to start for its first N selections, emitting the provider's placeholder shape. New
cases: the staging shape (whole unit bundle plus named UI tests, one unit class skipped), a
bounded UI selection that must not widen, a bundle that never starts and one whose retry runs
zero tests with exit 0, a bundle the caller selected nothing in, and the evidence graft with a
test that first runs (and fails) on the bundle retry.

Mutants run locally against the suite, all killed: the original script (6 failures),
placeholder treated as a test (5), selection widened to the whole bundle (2), unbounded empty
selection (1), skips dropped (4), zero-test retry counted as started (1), graft counts not
adjusted (1), new failures in the started bundle ignored (1). Not mutated: the Swift Testing
case where a top-level `@Test` function's identifier might lack a `/`; it would be treated as a
bundle failure and retried by the caller's bundle selection, which is conservative but would
report the bundle rather than the test. No such consumer exists today.

Fixtures use synthetic `App`/`AppTests`/`AppUITests` names; nothing from the private run
artifacts is committed.

## Appendix: commands

```sh
pnpm exec vitest run tests/ios-test-retry.test.ts      # 20 passed
pnpm typecheck
pnpm compile
pnpm morpheus pm index
```
