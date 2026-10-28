---
roadmap: MO-26-10-28-14.08.43
domains: [engineering, devops]
agents: [claude]
---

# Let superseded conventions runs pass with a notice

## Outcome

The reusable `pr-check.yml` used to fail with no message when a run's event head was no longer the
pull request's head. That was the bare `jq -e '.head.sha == $sha'`, which has run to completion on
every superseded run since `790ae1ff` removed the job's concurrency group. Now the run prints
`::notice::superseded by <sha>; this run's result is moot`, writes one line to the step summary
and exits 0 without running `check pr`. `cancel-in-progress` is not reintroduced.

It passes only when GitHub's copy of the PR is strictly newer than the event payload
(`updated_at`, compared as whole UTC timestamps). An older or equal copy, or a head or timestamp
that is missing or malformed, fails with an `::error::` that gives its reason. Evo calls
`pr-check.yml@main`, so this also fixes Evo's conventions noise once it merges.

No dependency was added. The change is a few lines of shell in an existing step.

## Evidence gathered first

- **The silent failure, confirmed in Evo.** Run 40193199936 (PR 646, event head `4313c5ae`, created
  12:27:42Z) read the live PR at 12:28:14Z, after `facf760f` had been pushed. It exited 1 with only
  `Process completed with exit code 1`, and its `pr / conventions` check run reports on `4313c5ae`.
  The only `pr / conventions` run on `facf760f` is that commit's own (121168444885). So a
  superseded run's result never lands on the newer head. That is the basis of the branch-protection
  argument below. A neighbouring red run, 40193208032, was a genuine `agent-reviewed` failure, not
  supersession, so not every red conventions run is this bug.
- **Evo's iOS CI premise did not hold.** The handoff said a merge-head check in Evo's iOS path
  filter still fails silently. Evo has no such check of its own. The check is the `Check native
  change scope` step of Morpheus's `ios-ci.yml`, which Evo pins (`8f31324`, 2026-10-14). Before
  2026-10-05, 14 of 20 sampled Evo iOS failures were in that step. That was the old silent
  `test "$(git rev-parse HEAD^1)" = "$PR_BASE_SHA"`, which fails when the merge ref is regenerated
  against a newer base, so the base moved and not the head. #321 fixed it on 2026-10-05. Since
  2026-10-08, none of the 19 failed Evo iOS runs failed in the scope step: all were build, test or
  lint failures. The remaining head-mismatch branch already prints
  `::error::PR merge head does not match event head.`. Superseded iOS runs are *cancelled* by Evo's
  caller-level `cancel-in-progress` (394 of 1,000 runs from 10-12 to 10-28), which shows as grey,
  not red. No Evo change was made.
- **`morpheus wait-ci` needs nothing.** It reads only the current head's `statusCheckRollup`
  (`commits(last: 1)`), so a run on a superseded SHA never reaches it. A `SUCCESS` conclusion maps
  to `pass`.

## Branch-protection argument

- **Where the pass is reported.** A `pull_request` run's check runs attach to the event's
  `pull_request.head.sha`, which is `EXPECTED_HEAD`. That was verified against Evo's retained runs
  above. Required checks are evaluated against the PR's current head SHA, so a pass on an older SHA
  is not a pass for the newer head.
- **A lagging read.** Suppose the API returns an older snapshot that still names the previous head.
  The run's own head may then be current, and a pass would be a pass on the current head with
  nothing checked. A snapshot no newer than the event's `updated_at` cannot prove the PR moved
  afterwards, so the guard fails closed there.
- **Residual: a head reset to the superseded SHA (A→B→A).** If the PR is later force-pushed back to
  exactly the superseded commit, that commit carries this run's pass. The `synchronize` run then
  creates a newer `pr / conventions` check on it, which shows as pending until it finishes. For the
  few seconds before GitHub creates that check run, the stale pass is the only conventions result
  on the head. The guard cannot detect this, because the reset happens after it has decided. The
  same window already exists for any commit whose older genuine pass was computed against labels or
  a body that have since changed. Closing it fully would need the superseded run to report under a
  name that is not required, for example a preceding job and a `needs`-dependent job name. That
  changes the required-check topology of every consumer, so it is left as an open question for
  Chris rather than built here.

## Validation

- Focused: `pnpm exec vitest run tests/workflows.test.ts -t "local review metadata"`, 13 tests. The
  new tests run the step's whole `run:` script under `bash -e`, with `gh` stubbed to return a fixture
  PR and `node` stubbed to record whether `check pr` ran. They cover:
  - a superseded head, with timestamps across midnight: notice, summary line, exit 0, no `check pr`;
  - the current head: `check pr` is invoked with the expected arguments;
  - equal and older live timestamps: exit 1 with the reason, no `check pr`;
  - an empty event time, a null live time, a non-ISO live time, a null live head and a non-SHA live
    head: exit 1, never `superseded by`.
- Mutation check. Each of the following mutants was killed by these tests, and the file was then
  restored:
  - `>` changed to `>=`;
  - the timestamp proof dropped;
  - the old `jq -e` line reinserted.
- `shellcheck -s bash` on the extracted step script: clean.
