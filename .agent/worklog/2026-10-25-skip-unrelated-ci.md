# Skip unrelated CI — MO-26-10-24-23.13.37

Chris requested a separate CI optimization PR after the Paperclip overview merge:
skip irrelevant expensive checks, retain PM/PR conventions, and explain/reduce
the duplicate Python artifact ABI legs without losing useful coverage.

## Implementation and choices

- Add a native Git/Node selector over the unique merge-base-to-head cumulative PR
  diff. Paths are NUL-delimited data, never shell input; deletions and old/new
  rename paths both count. Unavailable/ambiguous/oversized/incomplete comparisons
  and unknown paths run all. Main pushes run all. Only explicit verified false
  outputs from a successful detector skip work; failed/missing outputs run work.
- Keep PM, conventions and delivery independent. Always call the Node reusable
  workflow and skip inside it, preserving the required nested check name. Default
  true keeps existing reusable consumers unchanged. No protection changes.
- Keep all four artifact suites on Python 3.9 and 3.14 in one runner, collecting
  failure while still attempting the other version. Run one unchanged bounded
  fixture transport under Node 24 after both pass. Fixed fixture bytes do not
  gain a different Node ABI from a second Python interpreter. No performance or
  monetary savings benchmark is claimed.
- Considered dorny/paths-filter v4.0.3 (2026-08-05 publication; Node >=24; four
  runtime dependencies). The repository-specific selector is under 100 lines,
  uses existing Git/Node and adds no dependency. Durable choice in decisions.md.

## Recovery and evidence limitations

The original CI session was stopped after repeated permission prompts despite its
displayed full-access label. A replacement resumed the same claimed branch and
preserved handoff. Its actual current metadata was independently checked as
approval=never, disabled permission profile and danger-full-access. File
create/read/delete, process inspection and authenticated GitHub API probes passed
without prompts. This restores this author session; it does not claim to fix the
desktop application's general permission propagation bug. No overlapping author.

`morpheus codebase-memory install --check` passed for this exact checkout. Both the
graph status/coverage calls returned Transport closed, so verification used exact
source, parsed workflow configurations and compiler-resolved test import closures.
No graph completeness claim. Documentation-only path classification is deliberately
conservative and must be updated when a suite gains a non-imported runtime input.

## Validation

- `pnpm install --frozen-lockfile` passed.
- `pnpm exec vitest run tests/ci-scope.test.ts tests/workflows.test.ts tests/artifact-workflows.test.ts`
  passed: 207 tests. Covers real cumulative Git histories/base advancement, empty
  diffs, both rename directions, deletion, hostile filenames, missing history/Git,
  malformed events, incomplete/oversized output, actual CLI outputs, parsed failure/
  cancellation conditions, actual browser/bridge imports and executable Python
  loop success/install/probe/suite failures.
- Initial test-only fixture errors (missing rename destination, PATH-isolated Bash
  lookup) were corrected. A newline filename initially conservatively ran all;
  the prose matcher now accepts opaque newline characters and the exact expectation
  passes. No test was weakened to bypass these failures.
- All four Python suites passed on local system Python 3.9.6 and Homebrew 3.14.7.
  The exact compatibility-step script also passed via uv-managed 3.9/3.14; log is
  checkout-local `local/handoffs/ci-python-compatibility.log`. These are local
  compatibility checks, not proof of Actions transport or native delivery.
- `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` passed; no generated output drift.
- Four deliberate selector mutations were killed by the focused tests: skip unknown
  paths, accept truncated paths, remove the output buffer bound, and ignore old
  rename paths. Original source restored; logs remain in local/handoffs/ci-mutants/.
- GitHub runs and independent review are recorded below.
  No local full-suite rerun: this change touches workflows/scripts/tests, not
  shared core. CI owns the full suite. No visual surface changed.

## Real GitHub reporting proof

Temporary records-only [PR #500](https://github.com/cpheinrich/morpheus/pull/500)
compared one added inert worklog against this feature branch, rather than comparing
the feature's workflow edits against main. No protection or release setting changed.
[CI run 40179629369](https://github.com/cpheinrich/morpheus/actions/runs/40179629369)
passed: `changes`, `pm / pm`, `pr / conventions` succeeded; `node / check`,
`codex-claude`, `qa-browser`, `artifact-abi` and the existing delivery/review jobs
reported skipped. The required nested Node name is present. Probe closed unmerged.

[Implementation CI run 40179606943](https://github.com/cpheinrich/morpheus/actions/runs/40179606943)
selected all expensive jobs for the workflow/configuration changes. The macOS
bridge and the single Python/Node 24 artifact transport job passed. Full Node and
browser checks were still running when this evidence was prepared; their final
conclusions and final-head CI remain required before merge. Draft conventions are
intentionally unreported until the independent review record/label is complete.

The implementation run subsequently concluded success, including the full Node
suite/build cleanliness and browser QA. Reviewer independently confirmed these
results. The exact uv loop used Python 3.9.25 and 3.14.7 locally. Probe worktree and
temporary branch were removed after closure; the PR and run retain the evidence.

## Independent review

Independent high-risk review cleared the scoped CI without findings. After CI exposed an existing temporary-receipt test race, the same reviewer cleared the focused test correction, exact trunk integration and separate waiter follow-up ticket without findings. Focused tests and real implementation/prose-only reporting evidence passed; final-head GitHub CI remains required before merge.

One fresh reviewer, no inherited author history, one same-reviewer follow-up. High risk
reflects shared CI controls. Measured duration is from actual invocation/completion
clock readings, not an estimate. No visual surface changed. Graph transport remained
unavailable; exact source/configuration reads and focused tests supplied evidence.

```morpheus-review
{
  "version": 2,
  "base": "454cf6498f0d39aa78b05aa1a3af714ea2d154d2",
  "reviewed": "6693ee7b4d37bc1da994557197e3d0028944c3eb",
  "covered": "15e7a9857e56cea5de266c775c06ba3468ab01b1",
  "authorSession": "01a1723f-e386-7d73-b1d7-ac60b628624c",
  "reviewerSession": "/root/ci_scope_review",
  "risk": "high",
  "elapsedMinutes": 1.8181833333333333,
  "timing": {
    "source": "clock",
    "durationMs": 109091,
    "evidence": "Actual invocation boundary readings for /root/ci_scope_review in author thread 01a1723f-e386-7d73-b1d7-ac60b628624c: start 2026-10-25T09:13:27.968Z, completion 2026-10-25T09:15:17.059Z; includes tool execution and wait."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the scoped CI without findings. After CI exposed an existing temporary-receipt test race, the same reviewer cleared the focused test correction, exact trunk integration and separate waiter follow-up ticket without findings. Focused tests and real implementation/prose-only reporting evidence passed; final-head GitHub CI remains required before merge.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/ci_scope_review",
      "commit": "15e7a9857e56cea5de266c775c06ba3468ab01b1",
      "base": "04358bf0d82e5132d3f544f33860844fbc13c1ff",
      "outcome": "cleared",
      "elapsedMinutes": 1.07115,
      "timing": {
        "source": "clock",
        "durationMs": 64269,
        "evidence": "Actual same-reviewer follow-up invocation boundary readings for /root/ci_scope_review: start 2026-10-25T09:23:17.882Z, completion 2026-10-25T09:24:22.151Z; includes tool execution and wait."
      },
      "scopeReason": "Late CI correction after initial clearance: observe the reserved run's committed receipt instead of transient atomic-write siblings; inspect exact trunk integration, integrated test inputs and separate waiter backlog record.",
      "summary": "Cleared without findings: committed-receipt observation preserves termination/reservation assertions, production behavior is unchanged, trunk merge matches Git's automatic tree, and the waiter issue is separately tracked. Reviewer independently passed the corrected reconciliation and integrated import-closure tests."
    }
  ]
}
```

## Late CI test correction

Final-head runs 40179926816 and 40179927140 overlapped after push/ready events.
The existing PM concurrency group cancelled one PM invocation; rerunning that exact
job restored run 40179926816 to success. In the other run, Node failed 1/3015 tests:
the existing Paperclip killed-wrapper test enumerated a `.json.<pid>.tmp` receipt
and lost it to the supervisor's atomic rename before read. The same code passed
in the parallel run; this is an observed test race, not a product/provider failure.

Change only that test's observation to the reserved run UUID's committed `.json`
receipt and compare its parsed termination value exactly. No supervisor, worker,
quota or account behavior changes. `pnpm exec vitest run tests/paperclip-pilot.test.ts`
passed all 54 tests; typecheck, compile and PM index passed. The PR was returned to
draft and its review label removed pending the same reviewer's late-correction turn.

The wait-ci command reported green from the successful duplicate while the direct
GitHub check rollup still included the other run's failure/pending browser check.
Direct checks prevented premature merge. Track that separate waiter issue as MO-26-10-25-02.22.28 rather
than widening this CI-selection implementation to change the waiter itself.

Integrated main 04358bf (#498, QA composer/capture fixes) with an exact automatic
Git merge, without resolving or editing its implementation. No record changes on
trunk; context receipt refreshed after integration. Reran the three scoped workflow
suites against the integrated consumer imports before the follow-up review.

The same reviewer cleared follow-up commit 15e7a985 after independently passing
the corrected reconciliation test and integrated import-closure test (2/2).
Initial clearance and both measured invocation durations are preserved above.
Final-head checks are verified directly across applicable runs before merge.
