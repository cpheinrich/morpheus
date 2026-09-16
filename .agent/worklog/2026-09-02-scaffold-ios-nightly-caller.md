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

Independent normal-risk review of 7464d7cc7f6a6c0d44c2e80c4a889ef71fe4342e completed in 6 minutes with two substantive and three minor findings: the scaffolded upload job called a repository script init never writes and installed asccli from Homebrew against the 2026-09-04 decision, the release job passed upload-only inputs the reusable workflow tells cross-repository callers to leave unset, the commented schedule used a timezone key GitHub does not evaluate and omitted schedule-timezone, the init detection path had no test and picked a filesystem-order-dependent project, and the init note promised a seventh secret nothing reads. The author fixed all five in a8cd165 and integrated trunk at 3aaa3f5 (PR #179) in 9e54f66471139e94faba6d9351346cb345bca7a3. The same reviewer's follow-up verified the fixes, confirmed the merge carries only this PR's own files, ran the focused suites and the dist check, and cleared it in 3 minutes. Not verified: no scaffolded project has been taken through a real TestFlight upload from this template; the action-input contract is asserted by test rather than by a dispatch.

```morpheus-review
{
  "version": 1,
  "base": "3bca65b0e284ac0ab3cbf6d61329abd7b64962a4",
  "reviewed": "7464d7cc7f6a6c0d44c2e80c4a889ef71fe4342e",
  "covered": "9e54f66471139e94faba6d9351346cb345bca7a3",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "reviewer-ios-nightly-scaffold-0916",
  "risk": "normal",
  "elapsedMinutes": 6,
  "outcome": "complete",
  "summary": "Independent normal-risk review of 7464d7cc7f6a6c0d44c2e80c4a889ef71fe4342e completed in 6 minutes with two substantive and three minor findings: the scaffolded upload job called a repository script init never writes and installed asccli from Homebrew against the 2026-09-04 decision, the release job passed upload-only inputs the reusable workflow tells cross-repository callers to leave unset, the commented schedule used a timezone key GitHub does not evaluate and omitted schedule-timezone, the init detection path had no test and picked a filesystem-order-dependent project, and the init note promised a seventh secret nothing reads. The author fixed all five in a8cd165 and integrated trunk at 3aaa3f5 (PR #179) in 9e54f66471139e94faba6d9351346cb345bca7a3. The same reviewer's follow-up verified the fixes, confirmed the merge carries only this PR's own files, ran the focused suites and the dist check, and cleared it in 3 minutes. Not verified: no scaffolded project has been taken through a real TestFlight upload from this template; the action-input contract is asserted by test rather than by a dispatch.",
  "findings": [
    { "id": "IOSN-1", "severity": "substantive", "description": "The scaffolded upload job ran scripts/ios/upload-testflight.sh, which init never writes, and installed asccli via Homebrew; every scaffolded project fails at its first dispatch and the shape contradicts the ios-testflight-upload action and the 2026-09-04 pinned-binary decision.", "paths": ["src/init/templates.ts"], "disposition": "fixed", "response": "Upload job rewritten as a checkout of needs.release.outputs.sha plus one ios-testflight-upload action step with the six credential inputs from secrets.*; a test reads action.yml and asserts every passed key is declared and every required input is passed." },
    { "id": "IOSN-2", "severity": "substantive", "description": "The release job passed environment, upload-script, source-packages-directory and the four identifiers although run-upload is false, stating identifiers twice — the drift the workflow's input descriptions warn about.", "paths": ["src/init/templates.ts", "tests/workflows.test.ts"], "disposition": "fixed", "response": "Release job passes only the inputs the reusable workflow reads for a cross-repository caller; identifiers live once on the action step. Tests assert no upload-only inputs and exactly one occurrence of each identifier key." },
    { "id": "IOSN-3", "severity": "minor", "description": "The commented schedule used a timezone key GitHub's cron does not evaluate, and schedule-timezone was not forwarded, so screenshot dedup would run in UTC.", "paths": ["src/init/templates.ts", "tests/workflows.test.ts"], "disposition": "fixed", "response": "Cron written as 0 13 UTC with the 06:00 Pacific meaning beside it, no timezone key, schedule-timezone: America/Los_Angeles forwarded and asserted." },
    { "id": "IOSN-4", "severity": "minor", "description": "The init detection block had no test and .find over unsorted readdir output picked a filesystem-order-dependent project when two exist.", "paths": ["src/init/index.ts", "tests/init.test.ts"], "disposition": "fixed", "response": "Entries are filtered and sorted; four scaffold tests cover no project, detection, deterministic pick and never-overwrite." },
    { "id": "IOSN-5", "severity": "minor", "description": "The init note promised seven release secrets, including a Firebase plist secret the action treats as optional.", "paths": ["src/init/index.ts", "src/init/templates.ts"], "disposition": "fixed", "response": "The note names the six secrets from the exported IOS_NIGHTLY_SECRETS constant; a test asserts each name appears." },
    { "id": "IOSN-6", "severity": "incidental", "description": "hq/product/roadmap/MO-26-09-14-10.08.45 moved to shipped in this range via pm claim board reconciliation.", "paths": ["hq/product/roadmap/MO-26-09-14-10.08.45-isolate-ios-run-outputs.md"], "disposition": "deferred", "response": "Expected claim-time reconciliation, noted in the PR body." }
  ],
  "followUp": {
    "reviewerSession": "reviewer-ios-nightly-scaffold-0916",
    "commit": "9e54f66471139e94faba6d9351346cb345bca7a3",
    "base": "3aaa3f59bff04820cefd44a56c771cb2cd1439d6",
    "scopeReason": "Trunk advanced to 3aaa3f5 (PR #179) after the initial review; strict branch protection requires integration, so the one same-session follow-up covered the five fixes and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 3,
    "summary": "Follow-up cleared 9e54f66: all five findings fixed as described, the merge with 3aaa3f5 carries only this PR's own files with a correctly resolved import conflict, focused suites pass (210) and committed dist matches src."
  }
}
```
