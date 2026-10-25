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

Independent high-risk review cleared the scoped CI and single artifact transport without findings. The reviewer passed 43 focused tests and independently verified successful implementation CI and the prose-only skipped-check probe. No code corrections were required; final-head CI and record validation remain merge gates.

One fresh reviewer, no inherited author history, no follow-up turns. High risk
reflects shared CI controls. Measured duration is from actual invocation/completion
clock readings, not an estimate. No visual surface changed. Graph transport remained
unavailable; exact source/configuration reads and focused tests supplied evidence.

```morpheus-review
{
  "version": 2,
  "base": "454cf6498f0d39aa78b05aa1a3af714ea2d154d2",
  "reviewed": "6693ee7b4d37bc1da994557197e3d0028944c3eb",
  "covered": "6693ee7b4d37bc1da994557197e3d0028944c3eb",
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
  "summary": "Independent high-risk review cleared the scoped CI and single artifact transport without findings. The reviewer passed 43 focused tests and independently verified successful implementation CI and the prose-only skipped-check probe. No code corrections were required; final-head CI and record validation remain merge gates.",
  "findings": []
}
```
