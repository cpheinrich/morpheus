# 2026-09-02 — Scaffold the iOS nightly TestFlight caller

Item: MO-26-09-02-15.57.44

## Why now

Kairos spent four failed nightly runs rediscovering the cross-repository
environment-secret constraint, finishing forty minutes after #193 landed the fix
for it in this repository. Two projects, the same discovery, a day apart. The
knowledge existed and had nowhere to live that a new project would encounter it.

The same is true of the schedule. Evo and Kairos both ran `17 3 * * *` — a time
neither had a reason for, that had to be changed in two places once a standard
was agreed.

## What was rejected

**Putting the schedule in the reusable workflow.** This was the first thing
asked for, and it cannot work: GitHub only honours the `on:` block of the
workflow that starts a run. `ios-nightly-build.yml` is `on: workflow_call`, so a
`schedule:` added to it would be inert. Callers must own their trigger. What can
be centralised is the *file they start from*, which is what this does.

**A Morpheus-owned scheduler dispatching each project nightly.** This would put
the time genuinely in one place. It needs a PAT or GitHub App with workflow-write
on every project, which inverts the trust direction — Morpheus currently needs no
credential in any consumer — and it breaks change detection, because
`force-build: github.event_name == 'workflow_dispatch'` means every dispatched
run would skip the watched-path check and build unconditionally. Rejected as far
more machinery than a shared starting file.

**Plausible defaults for the app-specific values.** A guessed team id or bundle
id fails deep inside signing with a message about certificates, long after the
point where a `TODO` would have failed loudly.

## The judgement call worth flagging

The schedule ships **commented out**, so a scaffolded project releases only on
manual dispatch until someone uncomments it.

Against: it means `init` does not actually produce a nightly build, which is
arguably the whole point of the template.

For: a fresh project has no `testflight-internal` environment and no signing
secrets, so a live cron fails every night until it does. `ci` already refuses to
wire `node-ci` into a repository with no pnpm lockfile for exactly this reason,
and the comment there says why: a scaffold whose CI is red on day one teaches
people to ignore red CI. Shipping a cron that cannot succeed would contradict a
rule this codebase states three separate times.

The canonical 06:00 value is still present in the file, which is what stops the
next project inventing its own time.

## Verified

`tsc --noEmit` clean. 272 tests pass across `workflows`, `init` and `check`.

The existing "callers match what they call" test now renders the iOS template
and checks it too, so every `with:` key the scaffold passes is verified against
the reusable workflow's declared inputs. That guard is the reason to put the
template here rather than in documentation: prose cannot be tested against the
workflow it describes.

## Resumed on 2026-09-16

The original PR (#195) sat on a hand-named branch, conflicted with trunk for two weeks, and
predated the author-managed review contract. A fresh session staked the branch through
`pm claim` so the id and branch agree, cherry-picked the work onto current trunk, and ran the
review. The reviewer found that the scaffolded upload job was the 2026-09-02 shape — a repository
script `init` never wrote plus Homebrew `asccli` — both replaced on 2026-09-04 by the
`ios-testflight-upload` composite action and the pinned-binary decision, so every scaffolded
project would have failed on its first dispatch. The template is now a checkout of the verified
SHA plus one action step, which is what both live callers converged on.

Not carried into the record because it is not a review condition: the cron comment says "13:00
UTC (14:00 during standard time)", which reads as though the cron adjusts. A fixed `0 13` fires at
05:00 Pacific in winter; a project that cares edits the hour.

The review above was recorded against a branch that carried the item at `in-progress`;
`check pr` refused the PR on that status, and the item cannot change after a covered commit. The
branch was therefore rebased onto current trunk with the status set to `review` and the
architecture inventory line added, which requires a fresh review rather than editing the cleared
record. The first review's findings and their fixes are unchanged in content; only the SHAs moved.

Fresh independent normal-risk review of the rebased branch at 85a093d960eabdbf78e150b94f6e77fde7615436 completed in 2 minutes with one minor finding and one incidental note: the commented cron's parenthetical read as though GitHub adjusted it for standard time, and the ticket's premise that both consumers run 17 3 is stale (Evo runs 17 10 UTC, Kairos 0 6 UTC, so neither sits on the 06:00 Pacific slot the template calls standard). The reviewer verified every release-job key against the reusable workflow's inputs, every action-step key and all twelve required inputs against action.yml, the six secret names against both live consumers, deterministic project detection, never-overwrite, the forwarded schedule-timezone, the architecture section 12.11 sentence and its section 18.2 pointer, and that the tests would fail on the earlier defects. The author fixed the comment in 268416e and integrated trunk at 76ff450 (PR #255) in 3221f2911443729ff70edffcd96fb8b33cf397be; the same reviewer's follow-up cleared the fix and the integration in under a minute. Not verified: no scaffolded project has been taken through a real TestFlight upload from this template.

```morpheus-review
{
  "version": 1,
  "base": "a85c59b59865e8c04f0df1925b353e7bc0c4ec9c",
  "reviewed": "85a093d960eabdbf78e150b94f6e77fde7615436",
  "covered": "3221f2911443729ff70edffcd96fb8b33cf397be",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "nightly-caller-rebase-review-2026-09-16",
  "risk": "normal",
  "elapsedMinutes": 2,
  "outcome": "complete",
  "summary": "Fresh independent normal-risk review of the rebased branch at 85a093d960eabdbf78e150b94f6e77fde7615436 completed in 2 minutes with one minor finding and one incidental note: the commented cron's parenthetical read as though GitHub adjusted it for standard time, and the ticket's premise that both consumers run 17 3 is stale (Evo runs 17 10 UTC, Kairos 0 6 UTC, so neither sits on the 06:00 Pacific slot the template calls standard). The reviewer verified every release-job key against the reusable workflow's inputs, every action-step key and all twelve required inputs against action.yml, the six secret names against both live consumers, deterministic project detection, never-overwrite, the forwarded schedule-timezone, the architecture section 12.11 sentence and its section 18.2 pointer, and that the tests would fail on the earlier defects. The author fixed the comment in 268416e and integrated trunk at 76ff450 (PR #255) in 3221f2911443729ff70edffcd96fb8b33cf397be; the same reviewer's follow-up cleared the fix and the integration in under a minute. Not verified: no scaffolded project has been taken through a real TestFlight upload from this template.",
  "findings": [
    { "id": "CRON-01", "severity": "minor", "description": "The cron comment '13:00 UTC (14:00 during standard time)' read as though the schedule adjusted for DST; a project uncommenting 0 13 in winter fires at 05:00 Pacific.", "paths": ["src/init/templates.ts", "tests/workflows.test.ts", "dist/init/templates.js", "dist/init/templates.js.map"], "disposition": "fixed", "response": "The comment now states the fixed behaviour — 0 13 is 06:00 PDT and 05:00 PST, use 0 14 if 06:00 must hold in winter — and the test pins that sentence (268416e)." },
    { "id": "SLOT-02", "severity": "incidental", "description": "The ticket's premise that both consumers run 17 3 is stale: Evo runs 17 10 UTC and Kairos 0 6 UTC, so neither currently sits on the 06:00 Pacific slot the template calls standard.", "paths": ["hq/product/roadmap/MO-26-09-02-15.57.44-scaffold-ios-nightly-caller.md"], "disposition": "deferred", "response": "Not caused by this PR; noted in the PR body. If the standard slot is meant to be real, aligning the two callers is a follow-up item." }
  ],
  "followUp": {
    "reviewerSession": "nightly-caller-rebase-review-2026-09-16",
    "commit": "3221f2911443729ff70edffcd96fb8b33cf397be",
    "base": "76ff450cf5c5e1ea88724814c374ac516540e987",
    "scopeReason": "Trunk advanced to 76ff450 (PR #255) after the review; strict branch protection requires integration, so the one same-session follow-up covered the CRON-01 fix and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "Follow-up cleared 3221f29: the fix touches only the cron comment, its test and the regenerated dist; the merge with 76ff450 carries only this PR's own twelve files; typecheck, the focused suite (210) and the dist check pass."
  }
}
```
