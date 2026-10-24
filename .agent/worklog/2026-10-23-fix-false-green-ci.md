---
roadmap: MO-26-10-23-17.05.24
---

# Fix false-green CI receipts

## Diagnosis

Morpheus issues #449, #429 and #426 describe the same incomplete-registration
failure. #449 reproduced it on a stable head: four visible check rows had passed
while three current-head jobs were still running. GitHub Manager auto-merge is
intentionally enabled only behind required checks; it does not authorize the
separate `wait-ci` command to call partial evidence green.

The old loop exited when the nonempty set of *currently visible* rollup rows was
settled. It never consulted Actions runs, which can be queued or running before
their job checks register. The SHA and visible checks came from one GraphQL
response, but that consistency did not establish check-set completeness.

## Change and limits

When default `wait-ci` sees a green rollup, it now reads Actions runs filtered
to that exact commit. Any unfinished run keeps the wait pending. An API error,
malformed/foreign row, 100-row result or empty census beside visible Actions
checks exits with an error rather than green. A terminal run with a non-success
conclusion and no failed check receipt also refuses green. When the runs have
finished, it rereads the rollup and follows a moved head or newly registered
pending check before deciding. The `--required-only` option retains its
existing required-check scope. No merge, review, branch-protection or Manager
policy is changed.

The run list cannot prove that a future workflow trigger will never create a
run; this fix addresses the observed pending/running current-head runs and
the registration window. It should not be treated as a merge authorization.

## Validation

- Focused `tests/wait-ci`: 98 passed, zero failures. New scripted cases
  cover stable-head four-green/three-running, late rollup registration, a
  replacement head with a queued run, timeout with only a running workflow,
  API failure and an incomplete census.
- Independent review of the initial commit found that a confirmation poll could
  return a replacement head at the deadline, after the census of the old head,
  and the command could call its visible checks green without a census for the
  replacement. The fix marks that head unverified until a later poll checks its
  runs, or reports pending at the deadline. A clock-controlled regression
  reproduces the boundary. The same reviewer then found a related failed-check
  case: a failed replacement-head check at the deadline was incorrectly called
  pending. Failed checks now remain decisive, and a second clock-controlled
  regression covers that case. Focused `tests/wait-ci` now has 100 passing tests.
- `tsc -p tsconfig.build.json --noEmit`: passed.
- ESLint on `src/wait-ci/wait.ts`: passed.
- Build TypeScript compile generated only `dist/wait-ci/wait.js(.map)`
  and `dist/wait-ci/digest.js(.map)`.
- Full `tsc --noEmit` is blocked by the unchanged
  `tests/agentic-cto-skill.test.ts` import of removed `gray-matter` after
  the concurrent dependency update on main. This PR does not edit that test.
- A read-only `gh run list --commit` against the exact #449 reproduction
  commit confirmed the command's `headSha`, numeric `databaseId`, lowercase
  `status` and `conclusion` fields.

No production wait, CI rerun, merge, deployment or settings change was done.

## Independent review status

The fresh reviewer `/root/review_449` found a substantive deadline/head-change
false-green path in the initial commit `f42c49d8266bf56661fd6dddacb11da2b39f99f3`.
The author fixed it in `3c3b33c6bdb0b9afd5a2d1811631a0239dc6c070`. In the
same-reviewer follow-up, the reviewer found a related failed-check deadline
regression; the author fixed it in
`4b77daa4c4de56f01f23c9185f3be083ebbf3c61`. The reviewer cleared that
head with no remaining findings and independently reproduced timeout for an
unverified green replacement and failure for a failed replacement.

The follow-up had observed clock boundaries 2026-10-24 00:18:22–00:20:21 UTC.
The initial review's exact start/end or runner duration was not retained. The
version 2 review record requires that measured duration for every turn, so no
`morpheus-review` record or `agent-reviewed` label is claimed. PR #459 remains
draft with auto-merge disabled pending resolution of that evidence gap.
