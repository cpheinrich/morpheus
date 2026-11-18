# Test suite audit — 2026-11-18

Baseline: `9c4c3e58539f75d0bcabc545bfa9df3346488c30` (`origin/main`). Roadmap item
`MO-26-11-18-01.57.13`. This is an evidence package for a human decision. One test was changed;
everything else is ranked and left alone.

## The ask

Apply the [prune-tests](https://github.com/caldoai/skills/tree/main/skills/prune-tests) method to
Morpheus: keep a test only if it would fail on a regression of intended behaviour, and say what
that buys in CI waiting and maintenance. Keep the suite broadly intact.

## What was done

- Enumerated every tracked first-party test file at the baseline and mapped it to the CI job
  that runs it on a pull request.
- Rated all 240 files 1 to 5, and read the candidates the scans nominated line by line.
- Took timing from four already-finished `main` runs. Nothing was dispatched for measurement.
- Timed the 25 browser cases locally on each engine, because CI's reporter hides per-case time.
- Ran four local fault checks, each reverted, to test the claims below.

## Result

**Pruning will not shorten the wait.** The suite is in good shape: no file is rated below 3, one
case met the bar for removal, and six more are ranked for a human call. All seven together cost
under half a second of CI time. A normal full run takes 4.3 to 5.4 minutes.

**The wait is set by the browser lane, in two ways.** `qa-browser` was the longest job in every
run examined, with a median of 4.8 minutes across the last 35 runs that ran it.

- *Installing browsers.* The install step normally takes 30 to 100 seconds. In 4 of those 35
  runs it took 17 to 23 minutes, stalled on operating-system package downloads, and the whole
  run waited on it.
- *One slow behaviour in WebKit.* The 50 cases are the same 25 on two engines. Chromium finishes
  its 25 in under 32 seconds; WebKit takes the other 178 or more. Locally the WebKit run took
  176 seconds, and twelve cases account for 166 of them: each stalls roughly 10 seconds per pin
  capture, where Chromium needs under 1.5 seconds for the same case. No 10-second constant
  exists in `src/qa/` or `tests/browser/`, so the stall is inside the capture path. If WebKit
  captured at Chromium's speed, the lane would drop to roughly 100 seconds and the Factory job
  (3.3 to 3.9 minutes) would become the longest.

**One test was rewritten, and it closed a real gap.** `plugins/factory/tests/mcp.test.mjs` had a
case asserting that removed `pool_*` tools stay removed. Three other cases already fail if such a
tool comes back. Meanwhile the guard that stops a delegated worker from delegating again had no
test: with it disabled in both MCP servers, no bridge test that loads those servers failed. The
case now asserts that guard on both servers. Same fixture, same cost (about 0.25 s).

**Two suites detect nothing on a pull request.** `tests/firestore-rules.test.mjs` (12 cases on
generated HQ access rules) runs only under `pnpm test:rules`, which no active workflow calls.
`qa/evals/context-retrieval/` and `qa/prototypes/cd-v2/` (61 cases) have no runner either.

## Decisions for a human

1. **Browser install.** Worth a roadmap item: stop downloading operating-system packages on
   every run (a cached or prebuilt browser image). This is a CI lane change, so it is not made
   here.
2. **WebKit capture stall.** Worth a roadmap item: find why a pin capture costs about 10 seconds
   on WebKit. This is product or dependency behaviour, so it is outside this audit.
3. **Firestore rules suite.** Wire `pnpm test:rules` into a lane, or record that it is on demand.
   It guards auth rules, so on demand should be a stated choice.
4. **Six rating-2 cases** (appendix D). The method says prune three of them as "asserting the
   past"; this repository's own rule that a written "never do X" needs a failing test says keep.
   I left all six in place.
5. **Delivery review.** The [worklog](../../.agent/worklog/MO-26-11-18-01.57.13.md) records review and validation.

---

## Appendix A — Lanes and timing

Jobs in `.github/workflows/ci.yml` that execute first-party tests. `changes` selects lanes from
the PR diff with `scripts/ci-scope.mjs`; a push to `main` runs all of them.

| Job | Runner | What it runs |
|---|---|---|
| `node / check` | ubuntu | Root Vitest (`pnpm test`), which also shells out to three Python suites, one `node:test` suite and the workflow-repair `unittest` suite |
| `factory` | macOS | Bridge `node:test`; host Vitest, `unittest` and reporting `node:test`; Fleet claims against the Firestore emulator |
| `qa-browser` | ubuntu | Playwright, Chromium and WebKit, one worker |
| `artifact-abi` | ubuntu | Four Python scripts on Python 3.9 and 3.14 |
| `pm / pm`, `pr`, `agent-review` | ubuntu | Record and PR-convention checks; no test files |

Job wall time in seconds, four pushes to `main` (run ids are GitHub Actions run ids):

| Run | Head | `node / check` | `factory` | `qa-browser` | `artifact-abi` |
|---|---|---:|---:|---:|---:|
| 44253481138 | `9c4c3e585` | 138 | 200 | 263 | 16 |
| 44249506447 | `66891836f` | 198 | 233 | 249 | 19 |
| 44244745712 | `c60f76d14` | 175 | 228 | 242 | 13 |
| 44197529198 | `c106ea460` | 160 | 212 | 312 | 19 |

Those four are the normal case. Two further pushes in the same window, 44243033705 and
44239409289, took 22 and 27 minutes because `qa-browser` took 1,282 and 1,612 seconds. Across
the 35 most recent green runs that ran the job
([`browser-lane.tsv`](2026-11-18-test-suite/browser-lane.tsv)):

| Step | Typical | Outliers |
|---|---|---|
| Install browsers with OS dependencies | 29 to 102 s in 31 runs | 1,041 to 1,378 s in 4 runs |
| Run the 50 cases | 202 to 226 s in all 35 | none |

In both slow runs read, the log shows package fetches from the runner's Ubuntu mirror pausing for
minutes at a time. The cases themselves ran in 211 and 212 seconds.

Queue time was 2 to 3 seconds per job, and the lane selector adds about 12 seconds before the
others start. Where the time goes inside each job, run 44253481138:

| Job | Setup and install | Test step | Of which runner-reported case time |
|---|---:|---:|---|
| `node / check` | 11 s, then 18 s of concurrent typecheck, lint and build | 106 s | Vitest: 104.6 s wall, 270.3 s summed across files |
| `factory` bridge step | 8 s job setup | 93 s | 79.2 s (`node:test`), 230 cases |
| `factory` host step | | 39 s | 28.2 s `unittest` (278), 0.4 s Vitest (68), 1.9 s reporting (98) |
| `factory` Firestore step | | 54 s | 6.5 s for 2 cases; the rest installs the CLI and boots the emulator |
| `qa-browser` | 10 s, then 39 s installing browsers | 212 s | 50 cases; under 32 s Chromium, 178 s or more WebKit |
| `artifact-abi` | 6 s | 5 s | not parsed |

The Chromium and WebKit split is read from the send stamps interleaved with the progress dots in
the job log: 26 cases, so all of Chromium and the first WebKit case, had finished 32 seconds
after the run started.

Browser cases timed locally (developer Mac, one worker, list reporter). Chromium: 25 cases in
14.4 s, slowest 1.4 s. WebKit: 25 cases in 176.4 s. The twelve slow WebKit cases:

| Case | WebKit | Chromium |
|---|---:|---:|
| `qa-web-context.spec.ts:458` populated token-rich modal stays bounded | 22.5 s | 0.5 s |
| `qa-web-context.spec.ts:325` document scroll is applied once | 22.2 s | 0.4 s |
| `qa-web-context.spec.ts:149` styled Markdown document retains placement pixels | 21.4 s | 0.4 s |
| `qa-web-context.spec.ts:506` pending frozen image resumes after reload | 11.5 s | 1.4 s |
| `qa-web-context.spec.ts:122` saving a pin clears its composer | 11.4 s | 0.3 s |
| `qa-web-context.spec.ts:404` inherited design tokens stay bounded | 11.3 s | 0.4 s |
| `qa-web-context.spec.ts:245` failed sends and failed local saves | 11.3 s | 0.3 s |
| `qa-web-context.spec.ts:545` cross-origin artwork and video | 11.2 s | 0.3 s |
| `qa-web-context.spec.ts:183` sending freezes the submitted version | 10.9 s | 0.4 s |
| `qa-comments.spec.ts:98` pin two elements across page scroll | 10.9 s | 0.4 s |
| `qa-web-context.spec.ts:268` exact semantic state, modal identity | 10.8 s | 0.7 s |
| `qa-web-context.spec.ts:219` acknowledged batch removes only submitted pins | 10.4 s | 0.2 s |

Slowest root Vitest files in run 44253481138 (seconds summed per file; the lane ran them about
2.6 wide):

| File | Seconds | Instances | Note |
|---|---:|---:|---|
| `tests/local-review.test.ts` | 40.7 | 173 | Builds git history per case; no single slow case |
| `tests/complexity-check.test.ts` | 27.8 | 31 | Five real analyzer installs |
| `tests/cd/native-worker.test.ts` | 26.9 | 117 | |
| `tests/trunk-rescue.test.ts` | 14.2 | 56 | |
| `tests/cd/quota-reader-cli.test.ts` | 13.6 | 24 | Two real 3 s fuse waits |
| `tests/cd/quota-reader.test.ts` | 11.6 | 102 | One case sleeps 10.2 s |
| `tests/context-mcp.test.ts` | 9.4 | 18 | |

In the bridge step, `plugins/factory/tests/unattended-worker.test.mjs` is 46.3 s of the summed
94.9 s and `fleet-workspace.test.mjs` is 18.8 s.

## Appendix B — Inventory

The baseline contains 240 tracked test files and 4,057 source declarations. A declaration is one `it(`, `test(` or
`def test_`. A runtime instance is what the runner reports after table and loop expansion.

| PR lane | Runner | Files | Declarations | Runtime instances (CI receipt) |
|---|---|---:|---:|---:|
| `node / check` | Root Vitest | 160 | 3,199 | 4,535 (4,534 passed, 1 skipped) |
| `node / check` | Python, `node:test` and `unittest` suites wrapped by a Vitest case | 9 | 87 | counted above as 5 instances |
| `factory` | Bridge `node:test` | 31 | 221 | 230 |
| `factory` | Host `unittest` | 12 | 278 | 278 |
| `factory` | Host Vitest | 5 | 68 | 68 |
| `factory` | Host reporting `node:test` | 7 | 71 | 98 |
| `factory` | `node:test` on the Firestore emulator | 1 | 2 | 2 |
| `qa-browser` | Playwright | 3 | 24 | 50 |
| `artifact-abi` | Python scripts, two interpreters | 4 | 34 | not parsed |
| none | Firestore rules, retrieval evals, CD prototype, two mutation harnesses | 8 | 73 | none |

The per-file ledger is [`2026-11-18-test-suite/ledger.tsv`](2026-11-18-test-suite/ledger.tsv).

## Appendix C — Rating buckets

5 must keep, 4 keep, 3 keep but improve or verify, 2 consolidate or rewrite pending evidence,
1 recommend delete. A file takes the rating of its bulk; single cases that differ are in
appendix D.

| Rating | Files | Declarations |
|---:|---:|---:|
| 5 | 122 | 2,376 |
| 4 | 107 | 1,496 |
| 3 | 11 | 185 |
| 2 | 0 | 0 |
| 1 | 0 | 0 |

At case level: one case rated 1 (rewritten in this PR), six rated 2, seven rated 3.

Review depth, which limits how much weight a rating can bear:

| Depth | Files | Declarations | Meaning |
|---|---:|---:|---|
| targeted | 23 | 920 | Named cases read line by line; the rest of the file by scan |
| timed | 3 | 24 | Every case timed on both engines; bodies not read |
| scanned | 214 | 3,113 | Pattern scans over titles and bodies plus metrics; bodies not read |

Rating 5 on a scanned file is a judgement about its subject (review gates, session receipts,
git safety, auth, fleet binding, protected CI, delivery and spend), not a claim that each case in
it was verified.

## Appendix D — Candidates

Ranked strongest first.

| # | Rating | Case | What it asserts | Keeper, or why there is none |
|---:|---:|---|---|---|
| 1 | 1, rewritten | `plugins/factory/tests/mcp.test.mjs:210` "removed pool tools are absent and refuse without contacting the bridge" | No listed tool starts with `pool_`; five removed names return "not found"; nothing is written to the Factory home | `:84` "MCP advertises tools…" compares the listed names to the contract and checks the home is empty; `:103` and `:160` compare the same list. "Not found" for an unknown name is the MCP SDK's behaviour. Fault B confirms. |
| 2 | 2 | `tests/team.test.ts:427` "no longer exempts the directory nothing has" | `isRecordsOnly(["hq/inbox/…"])` is false | None. Fault C: re-exempting the path fails only this case and #3. `src/paths.ts:59` calls that return a mistake in prose, and the repository rule is that such prose needs a failing test. Kept. |
| 3 | 2 | `tests/team.test.ts:383` "leaves no source file pointing at the old inbox path" | No `src/**/*.ts` names `hq/inbox` outside comments | None. Textbook "moved, and asserted absent from its old path". It also stops a scaffold template shipping a dead path to new projects. Kept. |
| 4 | 2 | `tests/team.test.ts:343` "catches the old path in code while leaving prose about it alone" | Twelve assertions on `namesOldPath`, a helper defined in the test file at `:280` | Tests the test. It has a reason only while #3 stays, and goes with it. |
| 5 | 2 | `tests/workflows.test.ts:522` "runs only by hand: the hourly cron was deliberately removed" | `schedule.yml` triggers are exactly `workflow_dispatch` | None. Restoring a cron would be a decision, but it would also spend runner minutes for every project unannounced. Kept. |
| 6 | 2 | `tests/claim.test.ts:40` and `:45` | Same inputs and expected values as `tests/id.test.ts:165` and `:170`, through `slugify` | `slugify` is a one-line delegate (`src/pm/claim.ts:68`), so `id.test.ts` owns the rules. The copies are the only cases that fail if the delegate is replaced by a second implementation, which is the bug that created it. Consolidating to one case would lose nothing. |
| 7 | 3 | `tests/complexity-check.test.ts:334`, `:345`, `:356`, `:367` | Four historical analyzer pins are refused by the canary | They work as mutation tests of the canary. 15.7 s summed, with real installs. Consolidation needs evidence that one bad build exercises every canary file. |
| 8 | 3 | `tests/cd/quota-reader.test.ts:396`; `tests/cd/quota-reader-cli.test.ts:119` (two instances) | A startup longer than the old 10 s deadline is tolerated; the 3 s cleanup fuse holds | Real sleeps: 10.4 s and 6.6 s. An injectable clock would test the boundary in milliseconds, but that is a product seam. |

Scans that nominated nothing after reading: the zero-assertion scan had 13 hits. One is a
`describe` block, 10 were read and are anchored (one-line cases, wrappers and shared assertion
helpers), and 2 were inferred from the helper a read case uses. Three of nine duplicate-title
pairs were read; two guard different units and one is #6.

## Appendix E — Fault checks

Each was applied by hand to the working tree, run, and reverted with `git checkout`; the tree was
confirmed clean afterwards.

| Check | Fault | Command | Result |
|---|---|---|---|
| A, before the edit | Disable the "cannot delegate again" guard in `scripts/mcp.mjs` and `scripts/claude-mcp.mjs` | `node --test tests/*.test.mjs` in `plugins/factory` | 228 of 230 pass. Both failures are in `unattended-worker.test.mjs`, which loads neither server and fails 2 of 30 on unmodified code on this machine. The guard was untested. |
| B | Register a `pool_start` tool in `scripts/mcp.mjs` | `node --test tests/mcp.test.mjs` | 4 of 9 fail: the candidate and three keepers (`:84`, `:103`, `:160`). |
| A, after the edit | Disable the guard in one server at a time | `node --test tests/mcp.test.mjs` | The rewritten case fails each time, 8 of 9 pass. It reports the root-id refusal where the guard's message was expected. |
| C | Add `hq/inbox/` back to `RECORDS` in `src/paths.ts` | `vitest run tests/team.test.ts tests/check.test.ts` | 2 of 167 fail, both candidates. No other case notices. |

Focused evidence for the edit: `node --test tests/mcp.test.mjs` passes 9 of 9 before and after.

## Appendix F — Limits

- 214 of 240 files were rated from scans and metrics. Their cases were not read one by one.
- The scans are regular expressions. The weak-assertion scan flagged 93 cases it cannot judge
  (it does not recognise matchers such as `toBeNull`); those were not read.
- Timing is one fully parsed run, job and step durations from five more, and the browser job
  from 35. Hosted runners vary: the root test step ranged from 92 to 132 seconds.
- The cause of the slow browser installs is read from two logs. The other two slow runs were
  counted by duration only.
- Per-case browser times are local, on macOS. The WebKit total matched CI within 2 seconds;
  Chromium was 14 seconds locally against under 32 in CI.
- `unattended-worker.test.mjs` failed 2 of 30 cases locally on unmodified code and passed in all
  four CI runs. The cause was not investigated.
- One of the 61 off-lane cases failed once while another suite was running. Two reruns passed
  61 of 61 and the failing case was not captured.
- Bridge time per file is matched by literal test name, so 9 loop-generated bridge instances and
  27 reporting instances are not attributed to a file.
- The CLI guard at `plugins/factory/scripts/bridge.mjs:193` has no test asserting its message
  either. It was not fault-checked.
- No full local `pnpm test` was run; the change touches no shared core.

## Appendix G — Reproduce

```sh
node qa/audits/2026-11-18-test-suite/inventory.mjs --check   # counts, lanes, ratings
pnpm exec vitest list --json=instances.json                  # 4,535 root instances
gh run view 44253481138 --repo cpheinrich/morpheus --json jobs
gh run view --repo cpheinrich/morpheus --job 134629583975 --log   # node / check
gh run view --repo cpheinrich/morpheus --job 134629583869 --log   # factory
gh run view --repo cpheinrich/morpheus --job 134629583858 --log   # qa-browser
pnpm exec playwright test tests/browser --workers=1 --project=webkit --reporter=list
```

[`runtime.tsv`](2026-11-18-test-suite/runtime.tsv) holds the per-file numbers taken from those
logs; its root rows sum to the runner's own totals. Ratings and their one-line reasons are in
[`ratings.tsv`](2026-11-18-test-suite/ratings.tsv).
