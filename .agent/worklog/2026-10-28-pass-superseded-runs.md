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

- **A move after `head` decided fails the required name, and says why.** This happened in CI run
  40775473903 on `3949688b`:
  - `pr / head` read the PR at about 21:52:20Z and found `3949688b` current, finishing at 21:52:22.
  - `71041735` was pushed at 21:52:26.
  - `pr / conventions` started at 21:52:25. Its `Read the live pull request` step failed at 21:52:27
    with `Pull request #544 moved to '71041735…' after this run's head check found 3949688b… current.
    This job already reports as the required conventions check, so it cannot pass unchecked…`.
  - Every later step was skipped, so nothing was checked and nothing passed.

  The same run shows the normal-path names, `pr / head` and `pr / conventions`. So the dynamic job
  name evaluates to the required name when `superseded-by` is empty.
- **A superseded run reports `pr / superseded`, with the notice, and nothing under the required
  name.** This happened in Review metadata run 40775626807. The body edit's event (head `71041735`,
  payload `updated_at` 2026-10-28T21:53:21Z) produced a run only after `c5e27f66` was pushed.
  - `pr / head` logged `#544 moved from 71041735… to c5e27f66… (updated 2026-10-28T21:53:25Z, after
    this event's 2026-10-28T21:53:21Z)`.
  - The required job was created as **`pr / superseded`**, already under that name while queued. It
    passed with `##[notice]superseded by c5e27f663c3431673e19829865ec544f5dad5db2; this run's result
    is moot`.
  - The check runs on `71041735` that start with `pr /` are:
    - `pr / superseded` success (123124107230) and `pr / head` success, from this run;
    - `pr / conventions` failure (123123709047) and `pr / head` success, from that commit's own CI
      run.

  The failure is genuine: `✗ [agent-review] agent-reviewed label is not applied`, as expected before
  review. So the superseded pass sits beside the required name and does not replace it.
- **The payload's `updated_at` has the format the guard requires.** The live value
  `2026-10-28T21:53:21Z` matched `^[0-9]{4}-…T…Z$`, so supersession is decided in practice, not only
  in fixtures.


## Independent review

One fresh reviewer session, `ae671b109cbdc0980` (Claude Code subagent), took three turns at high
risk. The risk is high because `pr / conventions` gates merges in every consuming repository.

**Turn 1 (`11c65d90`): complete, blocked on F1.**
- **F1, substantive.** The in-step pass would attach to the old SHA as `pr / conventions`. A
  force-push back to that SHA would then show a green required check with nothing checked, and
  indefinitely if no new run is triggered, while `wait-ci` reported green.
- The reviewer cleared F1 only on condition that the records be corrected and Chris explicitly
  accept the residual.
- **F2, minor.** No test covered a non-SHA event head.

**Response.** I did not ask for that acceptance. I removed the residual with the `head` job and a
required job named from its decision (`824de7b5`), and added the event-head case for F2. Trunk was
merged at `3949688b`, with a hand-resolved conflict that kept both appended `.agent/decisions.md`
entries, and the result was verified live on #544.

**Turn 2 (`009a13c4`): cleared.**
- F1 and F2 resolved, confirmed against live runs 40775626807, 40775510146 and 40775473903.
- **N1, minor.** Creating the required check only after `head` finishes lengthens the existing
  window in which an older genuine pass stands after approval is withdrawn on an unchanged head.
  Document it as a cost.
- **I1, incidental, pre-existing.** `wait-ci` reports green when a required check has never
  reported.

**Response.** N1 is documented in the decision entry (`55d831a3`). I1 is filed as backlog
MO-26-10-28-15.00.57 in records PR #546. It went in a separate PR because only this worklog may
change after the covered commit; trunk brings it here.

**Turn 3 (`55d831a3`): finalization-only, cleared.** The reviewer attested that the N1 decision
prose restates behaviour it had already reviewed.

**Timing.**
- Turns 1 and 2 use the runner's `duration_ms` for each invocation.
- The finalization turn uses author clock readings. Its runner figure, 351347 ms, exceeded the 46.6
  seconds of wall-clock time the turn actually took, so it cannot be a per-turn measurement.

```morpheus-review
{
  "version": 2,
  "base": "322d6746e1817f5de0837ad7494479f7ad215656",
  "reviewed": "11c65d90bb4df8f407838c8ae1f6d0199ccd0142",
  "covered": "55d831a36c2e183cb153458710b7fa91fac6f7e8",
  "authorSession": "a30537dd92e4505ce",
  "reviewerSession": "ae671b109cbdc0980",
  "risk": "high",
  "elapsedMinutes": 8.486366666666667,
  "timing": {
    "source": "runner",
    "durationMs": 509182,
    "evidence": "Agent tool result for the initial invocation of reviewer agent ae671b109cbdc0980 reported duration_ms 509182; author clock immediately before the invocation read 2026-10-28T21:32:51.215Z (1793223171215)."
  },
  "outcome": "complete",
  "summary": "Turn 1 (high risk) reviewed the in-step superseded pass. The shell was correct under bash -e, shellcheck was clean, and the tests ran the step's real script and caught a weakened comparison or malformed values. F1 (substantive): a force-push back to a superseded SHA would show a green pr / conventions with nothing checked, possibly indefinitely, and wait-ci would report green; this was cleared only on condition that the records be corrected and Chris explicitly accept it. F2 (minor): no test covered a non-SHA event head. The author removed the residual by redesign instead, and the same reviewer confirmed in turn 2 that F1 and F2 are resolved.",
  "trunkIntegrations": [
    {
      "commit": "3949688b038b0f3c04fc3abe25b356b1b8b4eea3",
      "reason": "Hand-resolved conflict in .agent/decisions.md: this branch's decision entry and trunk's profiling entry were both appended at the end; both were kept intact. The reviewer inspected the resolution in turn 2."
    }
  ],
  "findings": [
    {
      "id": "F1",
      "severity": "substantive",
      "description": "An in-step pass attached to the superseded SHA as the required pr / conventions. After a force-push back to that SHA it was a green required check with nothing checked, until a new run reported or indefinitely if none was triggered, and wait-ci reported green; before the change that state was red.",
      "paths": [".github/workflows/pr-check.yml", ".agent/decisions.md", "docs/runbooks/independent-review.md", ".agent/worklog/2026-10-28-pass-superseded-runs.md"],
      "disposition": "fixed",
      "response": "Fixed by redesign in 824de7b5. A head job decides supersession first; the required job, which needs it and runs under always(), is named superseded only on proof of a move. So a superseded pass is pr / superseded and never pr / conventions. A failed or cancelled head, a lagging read, or a late move fails pr / conventions. Live runs on #544 confirmed the naming. Turn 2 cleared it."
    },
    {
      "id": "F2",
      "severity": "minor",
      "description": "No test exercised the non-SHA event-head rejection, so removing the EXPECTED_HEAD =~ $sha clause would have passed every test.",
      "paths": ["tests/workflows.test.ts"],
      "disposition": "fixed",
      "response": "Added the 'event head not a SHA' case to the head-decision tests in 824de7b5; the mutant that drops the clause is killed. Turn 2 confirmed it."
    },
    {
      "id": "N1",
      "severity": "minor",
      "description": "Because conventions now needs head, the required check run is created only after head finishes: about 6 s normally, longer under a runner backlog. This lengthens the existing window in which an older genuine pass stands after approval is withdrawn on an unchanged head.",
      "paths": [".agent/decisions.md"],
      "disposition": "fixed",
      "response": "Documented in the decision entry (55d831a3) as an accepted cost: the measured timing and the lengthened pre-existing window. The finalization turn attested that the prose restates the reviewed behaviour."
    },
    {
      "id": "I1",
      "severity": "incidental",
      "description": "wait-ci reports green when a required check has never reported, for example a draft whose conventions job was skipped, or a head returned to a superseded SHA, while GitHub still blocks the merge.",
      "paths": ["src/wait-ci/checks.ts"],
      "disposition": "deferred",
      "response": "Pre-existing, and outside this PR; another agent owns src/wait-ci/. Filed as backlog MO-26-10-28-15.00.57 in records PR #546, which says to coordinate with the wait-ci extension MO-26-10-28-14.09.01.",
      "roadmap": "MO-26-10-28-15.00.57"
    }
  ],
  "followUps": [
    {
      "reviewerSession": "ae671b109cbdc0980",
      "commit": "009a13c4398d3fb70b4a7a390d661dd8c1ad0f1b",
      "outcome": "cleared",
      "elapsedMinutes": 4.288783333333333,
      "timing": {
        "source": "runner",
        "durationMs": 257327,
        "evidence": "Runner result for the first SendMessage resume of reviewer agent ae671b109cbdc0980 reported duration_ms 257327 (relayed by the parent session); author clock at send read 2026-10-28T21:54:07.179Z (1793224447179)."
      },
      "summary": "The author fixed F1 by redesign rather than through the records-only condition. A head job compares the event's head with the live PR and decides superseded only on proof of a move. The required job runs under always(), needs head, fails unless head succeeded, and is named superseded only on that decision. A superseded pass therefore never carries the required name, even after a force-push back to the old SHA, and every other path fails closed. Live runs 40775626807, 40775510146 and 40775473903 on #544 confirm the naming, that no leftover required check is created, and the late-move failure. F2 is fixed, and the 17 focused tests pass. F1 and F2 are resolved. N1 (minor): creating the required check later lengthens an existing stale-pass window and should be documented. I1 (incidental): wait-ci reports green when a required check never reported. Cleared."
    },
    {
      "reviewerSession": "ae671b109cbdc0980",
      "commit": "55d831a36c2e183cb153458710b7fa91fac6f7e8",
      "scopeReason": "Finalizes the N1 decision prose, which documents the later creation of the required check and the lengthened stale-pass window caused by the head job topology.",
      "finalization": {
        "paths": [".agent/decisions.md"],
        "evidence": "git show 55d831a3: it touches only .agent/decisions.md. The added text matches the turn-2 measurement: pr / conventions is created once pr / head finishes (21:52:32 against 21:52:38 in CI run 40775510146 on #544), and this lengthens the existing window in which an older genuine pass stands after approval is withdrawn on an unchanged head.",
        "attestation": "The change only restates behaviour already reviewed and cleared in turn 2, recording it as an accepted cost in the decision entry; it adds no implementation, test or policy change."
      },
      "outcome": "cleared",
      "elapsedMinutes": 0.7761166666666667,
      "timing": {
        "source": "clock",
        "durationMs": 46567,
        "evidence": "Author clock read 2026-10-28T21:59:53.417Z (1793224793417) immediately before the second SendMessage resume of reviewer agent ae671b109cbdc0980, and 2026-10-28T22:00:39.984Z (1793224839984) at the first reading after its completion notice. The runner's duration_ms of 351347 exceeds that wall-clock interval, so it is not a per-turn measurement and was not used."
      },
      "summary": "The decision entry now records N1, the later creation of pr / conventions and the stale-pass window it lengthens, as an accepted cost, and this matches the reviewed behaviour. The review is cleared with N1 addressed."
    }
  ]
}
```
