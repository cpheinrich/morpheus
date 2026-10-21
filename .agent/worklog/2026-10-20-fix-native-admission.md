---
roadmap: MO-26-10-20-04.38.59
---

# Native admission correctness

The controller now reads an exact-run-attempt job census before choosing a
pre-upload timeout. It uses the configured admission bound only for positively
recognized queued/unassigned native work, even when Linux preflight has made
the workflow in-progress. Terminal automatic hosted fallback needs a nonempty
recognized cancelled-native set and explicit no-assignment/no-start evidence.
Unknown, empty, preflight-only or failed-preflight evidence owns durable repair
without fabricating quiescence. Existing verified-owned termination and
operational repair make that conservative state recoverable. A failure CAS
cannot release an upload claim that raced the census.

No dependency was added: this is domain-specific classification and census
validation using the existing Actions, pagination and Git CAS boundaries.
No job-name contract is introduced. Companion recognition is limited to hosted
Ubuntu runner labels or explicit skipped/unassigned downstream jobs. Local
recognition uses the configured label or self-hosted; hosted macOS recognition
uses macos-prefixed labels because consumers may select different hosted sizes
for tests and upload.

Source evidence: Verify-tier graph project Users-chrisheinrich-code-morpheus,
generation 2026-10-20T11:39:03Z, READY 8297 nodes/24471 edges. Controller search
returned all three relevant methods with no further page; failedRun has inbound
reconcileIntent and outbound state repair dependencies. Coverage metadata matches
the relevant source/docs/test paths with no recorded gap except controller test
line 13; exact source including that dynamic Vitest mock was read. Graph coverage
is best effort, not completeness proof. The isolated worktree starts at f65b7b4.

The official GitHub REST workflow-jobs documentation and GitHub's current
rest-api-description job schema were checked. Exact-attempt jobs paginate and
return required total_count; runner_id/name describe assignment and are nullable.
run_attempt is an optional job field, so the exact attempt endpoint binds it and
any returned value must match. Essential missing/unknown job evidence cannot
authorize no-start recovery. No live private jobs/API probe was performed.

References: [exact-attempt workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt),
[official job schema](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json).

An initial focused run found one incorrect test expectation: oldest debt is the
source's main-entry time, not attempt creation. Corrected the expectation to the
original persisted debt; the implementation retains that clock unchanged.

Validation and independent review evidence are recorded below before delivery.
No native/GitHub Actions/Apple delivery acceptance is claimed from synthetic tests.
The PR stays draft with auto-merge off, unmerged until the coordinator's gate.

Focused validation uses controller, provider adapter, state and Git store tests:
`pnpm exec vitest run tests/cd/controller.test.ts tests/cd/adapters.test.ts tests/cd/state.test.ts tests/cd/store.test.ts`.
These cover the changed Controller path and its direct Actions/pagination/CAS
dependencies. The final count is recorded with the committed implementation.
`pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and `git diff --check`
also pass. Generated controller JavaScript, declarations and source map are
committed. No local full suite was run; CI owns it.

Six targeted mutations were applied temporarily, exercised and restored:
workflow-status timeout selection (1 assertion failure), inclusive elapsed
boundary (2), ignored runner id (1; runner-name proof independently protected
the last-page fixture), ignored runner name (1), original vacuous no-start
predicate (12), and removal of the racing-upload CAS guard (1). Each was killed
by assertion failures, not compilation or fixture errors. Logs and the summary
are local `/tmp/native-admission-mutant-*.log` and
`/tmp/native-admission-mutations.json`; they are not deployment evidence.

Initial independent review of fa75e210696fceb48ce9b6ae6159b8b2df8fadc4
(`/root/native_admission/admission_review`, high risk) completed blocked with two
substantive findings. NA-1 reproduced a failed/incomplete census bypassing the
180-minute cancellation bound; classification now retains the read failure as a
visible wait but enforces that cancellation bound first, keeping ownership.
NA-2 reproduced a contradictory queued/null-start step with a completion time
being accepted as no-start; completion evidence now refuses both admission and
terminal fallback. Focused exact-boundary and contradiction regressions cover
both corrections. The same reviewer will inspect the correction commit; no
replacement reviewer or conditional clearance is used.

Correction validation passed 116 focused tests across the same four files,
typecheck, compile, pm index and diff-check. Two further temporary mutations
were killed and restored: throwing the census error before enforcing the bound
(3 assertion failures at just-after, with all 3 equality cases passing), and
ignoring step completion evidence (1 assertion failure). Summary:
`/tmp/native-admission-followup-mutations.json`. The corrected source and generated
counterparts are committed together for the same-reviewer follow-up.

The high-risk independent review found two substantive boundaries: failed job-census reads bypassed the 180-minute cancellation bound, and contradictory step completion could authorize no-start fallback. Both were fixed with focused boundary regressions and generated-output reproductions. The same reviewer cleared eea0d8619bc113239018f8378c8a483869cc9862 with no remaining findings or conditions. Live queued-job timestamp behavior and actual hosted delivery remain unverified; the draft/unmerged release hold remains.

The initial review used 171000 ms (2.85 minutes) and its same-reviewer follow-up
used 54000 ms (0.9 minutes), measured from actual author invocation-start and
reviewer final clock observations. These are measured turn boundaries, not
workload estimates. Reviewer session provenance is the exact canonical path
returned by the collaboration runner plus this author session's global ID.
Author focused validation: 116 passed across four files. The reviewer additionally
ran a focused 27-test selection and both original generated-output reproductions.
Only this worklog follows the cleared correction commit; final-head CI and
retained draft/auto-merge-off state are verified on the PR before reporting ready.

```morpheus-review
{
  "version": 2,
  "base": "f65b7b4a7d9ae4e945a1a192ab8f0b6c6be46c78",
  "reviewed": "fa75e210696fceb48ce9b6ae6159b8b2df8fadc4",
  "covered": "eea0d8619bc113239018f8378c8a483869cc9862",
  "authorSession": "01a1591a-d9b3-7890-b35a-93c8ae2a15d7",
  "reviewerSession": "/root/native_admission/admission_review",
  "risk": "high",
  "elapsedMinutes": 2.85,
  "timing": {
    "source": "clock",
    "durationMs": 171000,
    "evidence": "Author clock__curr_time before spawning canonical reviewer /root/native_admission/admission_review: 2026-10-20 11:47:46 UTC. Reviewer's actual final clock observation returned with blocked verdict: 2026-10-20 11:50:37 UTC. Initial turn only; source reviewed fa75e210696fceb48ce9b6ae6159b8b2df8fadc4."
  },
  "outcome": "complete",
  "summary": "The high-risk independent review found two substantive boundaries: failed job-census reads bypassed the 180-minute cancellation bound, and contradictory step completion could authorize no-start fallback. Both were fixed with focused boundary regressions and generated-output reproductions. The same reviewer cleared eea0d8619bc113239018f8378c8a483869cc9862 with no remaining findings or conditions. Live queued-job timestamp behavior and actual hosted delivery remain unverified; the draft/unmerged release hold remains.",
  "findings": [
    {
      "id": "NA-1",
      "severity": "substantive",
      "description": "Awaiting a failed/incomplete job census before timeout enforcement removed the strict 180-minute cancellation bound for nonterminal runs.",
      "paths": [
        "src/cd/controller.ts"
      ],
      "disposition": "fixed",
      "response": "Capture census failures, enforce the existing running-work bound while retaining active ownership, then preserve the error as a visible wait. Six exact-equality/just-after Controller/CAS cases cover missing totals, short pages and provider errors; an early-throw mutation fails all three just-after cases. Same reviewer verified committed generated-output reproduction and cleared."
    },
    {
      "id": "NA-2",
      "severity": "substantive",
      "description": "Ignoring step completed_at allowed a contradictory queued/null-start step with a completion timestamp to synthesize no-start quiescence and hosted fallback.",
      "paths": [
        "src/cd/controller.ts"
      ],
      "disposition": "fixed",
      "response": "No-start classification now requires absent/null step completion as well as no assignment, no job/step start and queued steps. The regression exercises admission and terminal fallback; ignoring completion again produces an assertion failure. Same reviewer verified the committed generated-output reproduction and cleared."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/native_admission/admission_review",
      "commit": "eea0d8619bc113239018f8378c8a483869cc9862",
      "outcome": "cleared",
      "elapsedMinutes": 0.9,
      "timing": {
        "source": "clock",
        "durationMs": 54000,
        "evidence": "Author clock__curr_time before same-reviewer followup_task: 2026-10-20 11:52:33 UTC. Reviewer's actual final clock observation returned with cleared verdict: 2026-10-20 11:53:27 UTC. Same canonical reviewer /root/native_admission/admission_review; follow-up1 only."
      },
      "summary": "NA-1 and NA-2 resolved; strict cancellation, visible census failures and ownership retained, contradictory completion rejected. Both committed generated-output reproductions passed. Focused reviewer regression selection: 27 passed, 29 skipped. No remaining/new findings or conditions."
    }
  ]
}
```
