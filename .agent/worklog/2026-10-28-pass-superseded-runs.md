---
roadmap: MO-26-10-28-14.08.43
domains: [engineering, devops]
agents: [claude]
---

# Let superseded conventions runs pass with a notice

## Outcome

The reusable `pr-check.yml` used to fail with no message when a run's event head was no longer the
pull request's head. That was the bare `jq -e '.head.sha == $sha'`, which has run to completion on
every superseded run since `790ae1ff` removed the job's concurrency group.

Now a new `head` job reads the live PR first. When the PR has provably moved since the event, the
required job is named `superseded` instead of `conventions`. It prints
`::notice::superseded by <sha>; this run's result is moot`, writes a step-summary line, runs none of
the checks, and passes. The required check `pr / conventions` is not reported by that run at all.
`cancel-in-progress` is not reintroduced. Evo calls `pr-check.yml@main`, so this fixes Evo's
conventions noise once it merges.

No dependency was added. The change is a small job and some step conditions in an existing
workflow.

## Evidence gathered first

- **The silent failure, confirmed in Evo.** Run 40193199936 (PR 646, event head `4313c5ae`, created
  12:27:42Z) read the live PR at 12:28:14Z, after `facf760f` had been pushed. It exited 1 with only
  `Process completed with exit code 1`, and its `pr / conventions` check run reports on `4313c5ae`.
  The only `pr / conventions` run on `facf760f` is that commit's own (121168444885). So a
  superseded run's result never lands on the newer head. A neighbouring red run, 40193208032, was a
  genuine `agent-reviewed` failure, not supersession.
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
- **`morpheus wait-ci` needs no change for this.** It reads only the current head's
  `statusCheckRollup` (`commits(last: 1)`), so a run on a superseded SHA never reaches it. It does
  not know which required checks are *absent*, though. A head whose only conventions result is
  `pr / superseded` (reachable only by force-pushing back to it) reads as green to `wait-ci` while
  GitHub still blocks the merge on the missing `pr / conventions`. That over-reports green; it does
  not open the gate. It is the same gap `wait-ci` already has for a draft whose caller skips
  conventions. Another agent owns `src/wait-ci/`, so it is left as a follow-up.

## Branch-protection argument

1. **Where a result is reported.** A `pull_request` run's check runs attach to the event's
   `pull_request.head.sha` (`EXPECTED_HEAD`). That was verified against Evo's retained runs above.
   Required checks are matched by name against the PR's current head SHA.
2. **A superseded run never reports the required name.** `conventions` is named
   `${{ needs.head.outputs.superseded-by != '' && 'superseded' || 'conventions' }}`, and `head`
   sets `superseded-by` only on proof of a move. So a superseded pass is `pr / superseded` on the
   old SHA. It cannot count for the newer head, and it still cannot if the PR is force-pushed back to
   that SHA (A→B→A). On that return, `pr / conventions` on A is whatever genuine runs reported, or
   absent, which blocks.
3. **Proof of a move, not a lagging read.** A read that lags the event can name the previous head
   while the event's head is still current. `head` therefore requires GitHub's copy to be strictly
   newer than the payload's `updated_at`, and both heads to be SHAs. Otherwise it fails, and
   `conventions` then fails too.
4. **Every other path fails the required name.**
   - `conventions` runs under `always()` (a skipped job would report `pr / conventions` as skipped,
     which satisfies protection), and its first step fails unless `head` succeeded. That covers a
     failed or cancelled `head`.
   - `Read the live pull request` runs before checkout. It fails `pr / conventions`, with a message,
     if the head moved after `head` decided, because by then the job already carries the required
     name.
   - After that read, the checks judge the event head's tree against that one consistent snapshot,
     exactly as before this change.

## Review turn 1 and the redesign

The first version (`11c65d90`) passed in-step: exit 0 with the notice, inside the job named
`conventions`. The independent reviewer (high risk) found F1, substantive. The in-step pass
attaches to the old SHA as `pr / conventions`. A force-push back to that SHA then shows a green
required check with nothing checked. That lasts until a new run reports, and indefinitely when
none is triggered (a push made with `GITHUB_TOKEN`, a fork run awaiting approval, an outage).
`wait-ci` would report green immediately. Before the change that state was red, so it was a
fail-open regression. It also found F2, minor: no test covered a non-SHA event head.

The reviewer conditioned clearance on Chris accepting that residual. The handoff's own rule was
to fail closed on any path where a stale green could count, so the residual was removed instead,
with the topology the first draft had named but not built. F2 is covered by the "event head not a
SHA" case. Same-reviewer follow-up: see the review record below.

## Validation

- Focused: `pnpm exec vitest run tests/workflows.test.ts`, 172 tests. The new tests in "local review
  metadata" do two things.
  - **Pin the topology:**
    - `conventions` needs `head` and runs under `always()`;
    - the name expression is evaluated mechanically for both decisions;
    - the first two steps carry exactly the require and superseded conditions, and every other step,
      including `Check PR conventions`, carries exactly `needs.head.outputs.superseded-by == ''`;
    - `head` has no concurrency and a timeout;
    - the env mappings for the event head and update time.
  - **Execute the steps' own scripts under `bash -e`,** with `gh` stubbed to a fixture PR and `node`
    stubbed to record whether `check pr` ran. They cover:
    - supersession across midnight (writes `superseded-by=<sha>`);
    - the current head (no output);
    - equal and older live timestamps (exit 1 with the reason);
    - six missing or malformed values, including a non-SHA event head (exit 1, no output);
    - the superseded report (the exact notice and the summary line, no `check pr`);
    - the require step for `failure` and `cancelled` (exit 1);
    - the conventions path end to end: `check pr` invoked while the head holds, and exit 1 with no
      `check pr` once it has moved.
- Mutation check, file restored after each:
  - On the first design: `>` changed to `>=`, the timestamp proof dropped, and the old `jq -e` line
    reinserted were each killed.
  - On this design: dropping the event-head SHA clause and making the late-move step exit 0 were
    each killed.
- `shellcheck -s bash` on every `run:` script in `pr-check.yml`: clean.
- `pnpm typecheck` passed. `pnpm compile` left `dist/` unchanged, since no source changed.
  `pnpm morpheus pm index` and `pm validate` passed.

## Live verification on #544

This PR's own CI calls the changed workflow locally (`uses: ./.github/workflows/pr-check.yml`). To
supersede a run on purpose, the PR body was edited, which starts a `Review metadata` run, and a
worklog-only commit was pushed immediately afterwards. The results are recorded below.

The first attempt produced no runs at all. The PR conflicted with trunk in `.agent/decisions.md`,
and GitHub creates no `pull_request` runs without a merge ref. Trunk was merged in (`3949688b`)
with both appended entries kept, and the test was repeated.
