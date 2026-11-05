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
  `Test Case` whose identifier is neither `Class/method()` (contains `/`) nor a top-level Swift
  Testing `test()` (ends with `)`). It reports such bundles as
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
adjusted (1), new failures in the started bundle ignored (1).

## Review turn 1 (conditional clearance) and the follow-up fixes

The fresh reviewer found three things, all fixed in the follow-up commit:

- **F1 (substantive):** the slash-only check classified a real top-level Swift Testing test
  (`topLevel()`) as a bundle that could not start. Its retry then had no `/` ids, so `ran` was
  empty and a genuinely flaky test never recovered. My first draft of this worklog called that
  "conservative, no consumer today"; that was wrong for a generic contract. A test is now an
  identifier containing `/` or ending in `)`. The regression retries `AppTests/topLevel()` by
  exactly that id and reports it flaky, with no bundle entries.
- **F2:** the graft subtracted the old bundle's cases from `passedTests` only, so a skipped or
  expected-failure case beside the placeholder was double-counted. Counts now move category by
  category (`tally`). The regression has one skipped and one expected failure beside the
  placeholder and checks 5 total / 3 passed / 1 skipped / 1 expected.
- **F3:** the flaky warning said "failed attempt 1" for a test whose first run and failure was
  the bundle retry. It now says "failed, then passed on a clean retry (attempt N of M)", which is
  true for both; the graft test asserts the late case.

The fake now models skipped and expected-failure results. Follow-up mutation run on 22 tests,
all killed: original script 9 failures; slash-only check restored (F1) 1; old graft subtraction
(F2) 1; "failed attempt 1" wording (F3) 2; placeholder treated as a test 6; selection widened 2;
unbounded empty selection 1; skips dropped 4; zero-test retry counted as started 1; graft counts
unadjusted 2; new failures in the started bundle ignored 1.

Fixtures use synthetic `App`/`AppTests`/`AppUITests` names; nothing from the private run
artifacts is committed.

## Independent review

Fresh reviewer (normal risk) gave conditional clearance at 58afc837 with one substantive and two minor findings. F1 (substantive): the slash-only placeholder check treated a real top-level Swift Testing test such as topLevel() as a bundle that could not start, so a flaky test there never recovered; the reviewer set the condition that a test is an identifier containing '/' or ending in ')'. F2 (minor): the graft subtracted the old bundle's cases from passedTests only, double-counting skipped or expected-failure cases beside the placeholder. F3 (minor): the flaky warning claimed 'failed attempt 1' for a test whose first failure was the bundle retry. The author fixed all three in 88a121f9 with regressions and a mutation run in which every mutant, including each reverted fix, was killed. Because F2 and F3 lay outside the F1 condition's scope, the same reviewer took a focused follow-up at 88a121f9, re-ran the 22 focused tests, hand-checked the graft counts and the top-level retry and warning, and cleared all three with no new findings. No disagreement remains. Limitation: post-merge runtime verification on the consumer's staging simulator has not happened yet.

```morpheus-review
{
  "version": 2,
  "base": "49f7dd23ce7920083faa26f8bdd62537f1cccad6",
  "reviewed": "58afc837f13836dc7f71d9008fb6254d539da6d9",
  "covered": "88a121f91f6817325fac39f9b4e96b2e2961862b",
  "authorSession": "fbbc4cb5-323f-472a-8a46-de3969c34456",
  "reviewerSession": "15de8042-a173-4e16-9ca3-086344bdbe2b",
  "risk": "normal",
  "elapsedMinutes": 2.5328166666666667,
  "timing": {
    "source": "runner",
    "durationMs": 151969,
    "evidence": "Factory run 4ceae2f8-4679-4549-84dd-d6274c713815, native Claude session 15de8042-a173-4e16-9ca3-086344bdbe2b: events.jsonl result event duration_ms=151969 (read by the root from the runner's native events, not the envelope or the reviewer's clock)."
  },
  "outcome": "complete",
  "summary": "Fresh reviewer (normal risk) gave conditional clearance at 58afc837 with one substantive and two minor findings. F1 (substantive): the slash-only placeholder check treated a real top-level Swift Testing test such as topLevel() as a bundle that could not start, so a flaky test there never recovered; the reviewer set the condition that a test is an identifier containing '/' or ending in ')'. F2 (minor): the graft subtracted the old bundle's cases from passedTests only, double-counting skipped or expected-failure cases beside the placeholder. F3 (minor): the flaky warning claimed 'failed attempt 1' for a test whose first failure was the bundle retry. The author fixed all three in 88a121f9 with regressions and a mutation run in which every mutant, including each reverted fix, was killed. Because F2 and F3 lay outside the F1 condition's scope, the same reviewer took a focused follow-up at 88a121f9, re-ran the 22 focused tests, hand-checked the graft counts and the top-level retry and warning, and cleared all three with no new findings. No disagreement remains. Limitation: post-merge runtime verification on the consumer's staging simulator has not happened yet.",
  "findings": [
    {
      "id": "RT-F1",
      "severity": "substantive",
      "description": "selectable() used '/' only, so a real top-level Swift Testing @Test identifier such as topLevel() was classified as a bundle that could not start: failure gave tests {} failed set() broken {AppTests}; a passing retry gave tests {} and broken empty, so 'ran' stayed empty and a legitimately flaky test never recovered, widening the retry to the bundle and misreporting it. 'No current consumer' is not a valid exception for a generic contract.",
      "paths": [
        "scripts/ios-test-retry.py"
      ],
      "disposition": "fixed",
      "response": "A test identifier is now one that contains '/' or ends with ')'; the comment names top-level Swift Testing tests. The worklog's earlier 'Not mutated' note is corrected.",
      "condition": {
        "paths": [
          "scripts/ios-test-retry.py",
          "tests/ios-test-retry.test.ts",
          ".agent/worklog/2026-11-05-retry-failed-test-bundles.md"
        ],
        "evidence": "Regression: topLevel() fails first then passes, is retried with exactly -only-testing:AppTests/topLevel(), appears flaky and in neither failedBundles nor recoveredBundles; show the regression fails when the old slash-only check is restored; the full focused retry test file and typecheck pass."
      },
      "conditionMet": "88a121f9: 'retries a failed top-level Swift Testing test by its own id, not as a bundle' asserts retry -only-testing:AppTests/topLevel() only, flaky [{AppTests/topLevel(), 2}], failedBundles [] and recoveredBundles []. With the slash-only check restored the suite fails 1 test (that regression). pnpm exec vitest run tests/ios-test-retry.test.ts: 22 passed; pnpm typecheck passed."
    },
    {
      "id": "RT-F2",
      "severity": "minor",
      "description": "combine() subtracted all of the old bundle's cases from passedTests only; if the old bundle had Skipped or Expected Failure cases beside the placeholder, skippedTests/expectedFailures double-counted and passed came up short (old 1 skipped + placeholder, retry 1 skipped + 3 passed reported passed 2 skipped 2 instead of 3/1).",
      "paths": [
        "scripts/ios-test-retry.py",
        "tests/ios-test-retry.test.ts"
      ],
      "disposition": "fixed",
      "response": "A tally() helper counts a node's cases by summary category; the graft adds new minus old per category. A regression with one skipped and one expected failure beside the placeholder asserts total 5, passed 3, failed 0, skipped 1, expected 1 in the summary and per-device counts; reverting to the old subtraction fails it."
    },
    {
      "id": "RT-F3",
      "severity": "minor",
      "description": "The flaky warning said a test 'failed attempt 1' even when it first ran (and failed) on a bundle retry at attempt 2 and passed on attempt 3.",
      "paths": [
        "scripts/ios-test-retry.py",
        "tests/ios-test-retry.test.ts"
      ],
      "disposition": "fixed",
      "response": "The warning now reads 'failed, then passed on a clean retry (attempt N of M)', true in both cases, with no new counter. The graft test asserts the late-first-failure warning and that 'failed attempt 1' is absent; restoring the old wording fails 2 tests."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "15de8042-a173-4e16-9ca3-086344bdbe2b",
      "commit": "88a121f91f6817325fac39f9b4e96b2e2961862b",
      "scopeReason": "Follow-up after conditional clearance: resolve F1 and assess F2/F3 summary-accounting and diagnostic corrections outside the original F1 condition.",
      "outcome": "cleared",
      "elapsedMinutes": 0.7104666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 42628,
        "evidence": "Factory run 4af33805-caa9-4d80-92e0-97be52c4d914, resumed native Claude session 15de8042-a173-4e16-9ca3-086344bdbe2b: events.jsonl result event duration_ms=42628 (read by the root from the runner's native events, not the reviewer's clock)."
      },
      "summary": "Same reviewer confirmed F1 (substantive) and F2/F3 (minor) resolved at 88a121f9 with no new findings: 22 focused tests pass, graft counts hand-checked (4 old cases to 5 combined: passed 3, skipped 1, expected 1, failed 0), and topLevel() retried individually with an accurate warning."
    }
  ]
}
```

## Appendix: commands

```sh
pnpm exec vitest run tests/ios-test-retry.test.ts      # 20 passed; 22 after the review fixes
pnpm typecheck
pnpm compile
pnpm morpheus pm index
```
