# CI speed: what was measured and what changed

Roadmap item MO-26-11-16-21.10.20. Measured 2026-11-16 on GitHub-hosted `ubuntu-latest`
(four cores, public repository). [CI scope](ci-scope.md) covers which checks run at all.

## The ask

Chris asked which of five ideas from a tweet about faster CI hold up for Morpheus, with proof,
before any of them reaches another project: a faster type checker (`bun check`), Oxlint, test
shards balanced by time, running only the tests a diff can reach, and running lint, typecheck,
build and tests in parallel.

## Where the time goes

A pull request waits on four required checks. Three finish within a minute. The fourth,
`node / check`, takes about three minutes and is the whole wait: a typical run reports at
3 minutes 14 seconds after the push.

Inside that job the tests take about two thirds (typically 114 seconds, between 89 and 135
depending on the machine GitHub hands out). They already use every core. The steps around the
tests (typecheck, lint, installing the context-search runtime, and rebuilding and verifying
`dist/`) take 43 seconds one after another. Typecheck is 11 of those and lint is 5, so
replacing either tool can save at most that.

Browser QA and the Factory job run longer in total, but neither is required, so they do not
hold a merge.

## Verdict on each idea

| Idea | Verdict | What the measurement showed |
|---|---|---|
| Parallel lint, typecheck, build | **Adopted as an opt-in pilot** | The four steps around the tests run at once in the same job: 25 seconds instead of 43. No extra runner. |
| `bun check` for `tsc` | Not now | 0.1 s against 5.5 s locally, with identical errors. But typecheck no longer holds anything up once it runs alongside the other checks, and `dist/` still needs `tsc`. |
| Oxlint for ESLint | Not now | 0.06 s against 3.4 s locally; every rule migrates. Lint is 5 seconds in CI and no longer holds anything up. Swapping it reverses the pinned ESLint contract. |
| Test shards | Promising, separate item | Two native shards cut the test step from 87 to 63 seconds in the same run. It costs a second runner and a restructured required check. |
| Shards balanced by time | Rejected | Vitest splits by file, not time. Balancing would save roughly ten more seconds and needs a custom sequencer plus stored timings. |
| Only tests the diff reaches | Rejected | Vitest follows imports. It selected no tests for a change to a workflow, `AGENTS.md` or a doc, though 90 of 159 test files read such files from disk. |

"Not now" means the tool works and the saving is real but small here. Either becomes worth
revisiting if the two follow-ups below land, because typecheck would then set the pace again.

## What changed

`node-ci.yml` has a new input, `parallel-static-checks`, off by default. With it on, one step
starts typecheck, lint, the context-runtime install and the verified build together, waits for
all of them, and fails if any failed. Each runs the same script the serial step runs, through
a YAML alias, so there is one definition of each. The tests run afterwards with the runner to
themselves. Morpheus's own `ci.yml` turns the input on.

Two behaviours differ in this mode, both only for a caller that opts in:

- The build now runs before the tests. A stale `dist/` fails the job before the tests start,
  rather than after them, so that run reports no test results.
- The tests read the rebuilt `dist/`. Verification proves it identical to the committed one
  whenever the step passes, so a passing job tested the same bytes as before.

The required check names and path selector are the same. The full suite follows a successful
static check on Node-scoped pull requests and main pushes. In the pilot, the generated-output
check verifies `dist/` before tests start. The default workflow verifies it after tests.

## Result

Across four pull-request runs on this branch, against thirteen on other branches the same day:

- The steps around the tests took 25 seconds (22 to 32) instead of 43 (30 to 59).
- `node / check` took 155 seconds (143 to 165) instead of 177 (141 to 209).
- Measured from workflow creation, `node / check` finished at 167 seconds (155 to 176)
  instead of 194 (153 to 222).

The four overlapping steps saved 18 seconds at the median using one runner. Whole-job
timings also include variation in test time and setup. The required `node / check`
kept its name. Draft-check reporting is described below.

## Rollout and revert

Morpheus enables the input and the step log prints each check's duration. A same-commit
consumer experiment on a two-core runner took longer when typecheck and lint shared the
runner with unit tests. That project needed to keep its build after those checks because
the build writes generated types and design tokens. Adoption of that variant stops at
the experiment. Measure any future variant on the consumer's runner and keep its build
dependencies and required checks in the comparison.

To revert in Morpheus, delete `parallel-static-checks: true` from the caller. The serial
steps resume on the next run.

## Follow-ups worth an item each

- **Fetch ripgrep without apt.** The context-runtime install is now what the concurrent step
  waits for (12 to 32 seconds, nearly all of it `apt-get`). A pinned, checksummed binary, as
  actionlint is fetched today, would bring the step to about 15 seconds.
- **Two test shards behind an aggregating `check` job.** Estimated to take roughly another
  20 seconds off the wait for one more runner. The job named `check` must stay and must report
  failed, cancelled and skipped shards correctly, which is why it is not folded in here.

## Appendix A: baseline runs

Seconds, median with range. "Reported at" is measured from the workflow's creation, so it
includes the path selector job and queueing.

| | Pull request (13 runs) | Main (3 runs) |
|---|---|---|
| Queue for `node / check` | 3 (2–4) | 3 (2–3) |
| `node / check` starts at | 14 (12–28) | 13 (12–14) |
| `node / check` duration | 177 (141–209) | 173 (153–176) |
| Required checks reported at | 194 (153–222) | 186 (165–190) |
| Setup (job, checkout, pnpm, Node) | 8 (5–27) | 8 (7–16) |
| Install | 7 (5–8) | 7 (5–8) |
| Typecheck | 11 (9–15) | 10 (10–13) |
| Lint | 5 (4–7) | 4 (4–6) |
| Context-runtime install | 13 (10–37) | 11 (11–31) |
| Build and verify | 8 (7–10) | 7 (7–10) |
| Those four, one after another | 43 (30–59) | 40 (32–52) |
| Test | 114 (89–135) | 103 (91–115) |
| Whole workflow, last job done | 294 (239–408) | 283 (278–297) |
| Runner seconds, all jobs | 730 (446–816) | 639 (625–713) |

Pull-request runs: 43978060113, 43971799807, 43970939537, 43970490894, 43970260421,
43969890937, 43969821626, 43966351127, 43965244149, 43964515879, 43964252670, 43963281995,
43846555538. Main runs: 43972503373, 43971666019, 43970846817. Run 43969890937 was re-run, so
its `pm / pm` finished late; the required figure uses `node / check`, which finished last in
every other run.

In run 43978060113 Vitest reported 91.67 s of wall time for 230.21 s of test time across 159
files. The five slowest files hold 105 of those seconds and the slowest takes 33, so no single
file bounds the run; throughput stays near 2.6 test-seconds per second from start to finish.

## Appendix B: pilot runs

Pull request #733, `parallel-static-checks: true`.

| Run | Commit | Concurrent step | Typecheck | Lint | Build | Context runtime | Test | `node / check` | Reported at |
|---|---|---|---|---|---|---|---|---|---|
| 44024584533 | 33d1ec60 | 25 | — | — | — | — | 116 | 161 | 174 |
| 44025455712 | 1a368a6d | 32 | 15 | 9 | 13 | 32 | 87 | 143 | 155 |
| 44026398365 | cf07fdd5 | 22 | 19 | 11 | 15 | 22 | 103 | 148 | 159 |
| 44027316932 | 447563cc | 25 | 23 | 14 | 19 | 24 | 119 | 165 | 176 |

Per-check durations were added in the second commit. Running together slows each check
(typecheck 11 to 15–23, lint 5 to 9–14, build 8 to 13–19), but the step lasts only as long as
the slowest. On a slow machine (the last run) typecheck nearly matches the context-runtime
install. Whole-workflow time is unchanged within noise (307 against 294) because browser QA
finishes last. Runner seconds for the three runs without the measurement job were 676, 706
and 739, against a baseline of 730.

On every run, `node / check`, `pm / pm`, `changes`, `qa-browser`, `factory` and
`artifact-abi` passed. GitHub reported `agent-review / delivery` as skipped. The caller
job `pr` skipped on the unlabelled draft, leaving the required `pr / conventions` check
unreported until review.

## Appendix C: tool measurements

Local, 16-core Apple silicon, three runs each, this repository at 898406bd.

| Command | Time | Notes |
|---|---|---|
| `tsc --noEmit` (TypeScript 5.9.3) | 5.5–6.0 s | 463 project files |
| `bun check --no-script` (Bun 1.4.4) | 0.12–0.14 s | No errors on the tree; on a seeded file it reported the same two errors as `tsc` (TS2322, TS2532) at the same positions |
| `eslint src` (ESLint 10.9.1) | 3.3–4.0 s | |
| `oxlint -c <migrated> src` (Oxlint 1.94.0) | 0.06 s | `@oxlint/migrate` converted all 24 rules with no JS plugin; on a seeded file it reported the same four findings as ESLint |
| `pnpm compile` | 4.5 s | |
| The concurrent step, without the context runtime | 6.0 s | Against 13.4 s for the three commands in sequence |

`bun check` is a port of typescript-go that tracks TypeScript 7; it checks only, with no
JavaScript or declaration output, so the build keeps `tsc`. Morpheus is on TypeScript 5.9, so
adopting it would also mean two type-system versions in one pipeline. `tests/lint-contract.test.ts`
pins lint to ESLint 10.

## Appendix D: shard measurement

One temporary job in run 44025455712 ran `vitest run --shard=1/2` and `--shard=2/2` on two
runners, then was removed in the next commit.

| | Files | Vitest wall | Test time | Whole job |
|---|---|---|---|---|
| Shard 1 | 80 | 62.5 s | 162.5 s | 95 s |
| Shard 2 | 80 | 38.4 s | 91.7 s | 89 s |
| Unsharded, same run | 160 | 86.1 s | 216.4 s | 143 s |

Vitest assigns files by a hash of the path, so the split was 64 to 36 by time. An ideal split
would put each near 52 seconds. Shard 1 failed six tests only because the temporary job did not
install actionlint; the timings stand. Each shard pays its own setup, install and
context-runtime install (about 30 to 50 seconds).

## Appendix E: test selection

`vitest related .github/workflows/node-ci.yml docs/ci-scope.md AGENTS.md --run` selected no
test files. By path, 4 test files read `node-ci.yml`, 21 read files under `docs/`, and 15 read
`AGENTS.md` or `architecture.md`. Of the 159 test files, 90 read files from disk and 39 start
other processes. The existing path selector already skips the whole Node check for prose-only
pull requests.

## Appendix F: sources

- Bun 1.4.3 release notes, `bun check`: <https://bun.com/blog/bun-v1.4.3>
- Oxlint: <https://oxc.rs/docs/guide/usage/linter.html> and
  <https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html>
- Vitest sharding: <https://vitest.dev/guide/improving-performance>
- Vitest `--changed`, `related` and `--shard`: <https://vitest.dev/guide/cli>
- Timings: `gh api repos/cpheinrich/morpheus/actions/runs/<id>/jobs`, per step
  `completed_at - started_at`.
