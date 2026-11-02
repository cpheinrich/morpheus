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

The supported Codex thread reader later supplied runner durations for both
turns: 75,963 ms for the initial review and 130,748 ms for the follow-up.
Those are the runner's recorded durations, not estimates from chat timestamps.
The follow-up also had observed clock boundaries 2026-10-24 00:18:22–00:20:21
UTC. PR #459 remains draft with auto-merge disabled; the unrelated full
typecheck failure is being handled separately.

A fresh normal-risk independent reviewer (/root/review_449) found F1-449, a substantive false-green path when a confirmation poll reached a replacement head at the deadline. The author made that head unverified until its runs were checked, and added a clock-controlled regression. During the same-reviewer follow-up, MIN-02 found that the new guard hid an already failed replacement-head check; the author kept failed checks decisive and added a second regression. The reviewer cleared 4b77daa4 with no remaining findings. The reviewer independently reproduced timeout for an unverified green replacement and failure for a failed replacement; its own Vitest invocation produced no output and was interrupted, while the author's focused suite passed 100/100. The supported Codex thread reader supplied measured durations for both turns.

```morpheus-review
{
  "version": 2,
  "base": "0a4722e7c2f6aa259174e56af7b638dd953e7be5",
  "reviewed": "f42c49d8266bf56661fd6dddacb11da2b39f99f3",
  "covered": "4b77daa4c4de56f01f23c9185f3be083ebbf3c61",
  "authorSession": "01a165f6-aca4-72a2-b9c5-e607c9ca902d",
  "reviewerSession": "/root/review_449",
  "risk": "normal",
  "elapsedMinutes": 1.26605,
  "timing": {
    "source": "runner",
    "durationMs": 75963,
    "evidence": "Codex read_thread for reviewer thread 01a16b43-5080-7699-99dc-ffb410ed302b, initial turn 01a16b43-52fa-77ef-a78d-b0323cd65789: durationMs=75963, startedAt=1792800937, completedAt=1792801013."
  },
  "outcome": "complete",
  "summary": "A fresh normal-risk independent reviewer (/root/review_449) found F1-449, a substantive false-green path when a confirmation poll reached a replacement head at the deadline. The author made that head unverified until its runs were checked, and added a clock-controlled regression. During the same-reviewer follow-up, MIN-02 found that the new guard hid an already failed replacement-head check; the author kept failed checks decisive and added a second regression. The reviewer cleared 4b77daa4 with no remaining findings. The reviewer independently reproduced timeout for an unverified green replacement and failure for a failed replacement; its own Vitest invocation produced no output and was interrupted, while the author's focused suite passed 100/100. The supported Codex thread reader supplied measured durations for both turns.",
  "findings": [
    {
      "id": "F1-449",
      "severity": "substantive",
      "description": "If confirmation found a replacement head at the deadline, wait-ci could report its visible checks green without listing that replacement head's Actions runs.",
      "paths": ["src/wait-ci/wait.ts", "tests/wait-ci/wait.test.ts", "src/wait-ci/digest.ts"],
      "disposition": "fixed",
      "response": "Agreed. Commit 3c3b33c6 marks a replacement head unverified until its own run census completes, or returns timeout if the deadline has arrived. Added a clock-controlled regression; focused wait-ci suite passed. The same reviewer reproduced timeout on the generated dist."
    },
    {
      "id": "MIN-02",
      "severity": "minor",
      "description": "The initial F1 guard made a failed replacement-head rollup at the deadline report pending instead of preserving the decisive failed check and its details.",
      "paths": ["src/wait-ci/wait.ts", "tests/wait-ci/wait.test.ts"],
      "disposition": "fixed",
      "response": "Agreed. Commit 4b77daa4 keeps an observed failed check decisive while only an otherwise green unverified head remains pending. Added a clock-controlled failed-head regression; focused wait-ci suite passed 100/100. The same reviewer reproduced exit 1 for failed and exit 2 for green replacement heads."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_449",
      "commit": "4b77daa4c4de56f01f23c9185f3be083ebbf3c61",
      "outcome": "cleared",
      "elapsedMinutes": 2.179133333333333,
      "timing": {
        "source": "runner",
        "durationMs": 130748,
        "evidence": "Codex read_thread for reviewer thread 01a16b43-5080-7699-99dc-ffb410ed302b, follow-up turn 01a16b45-d45f-766c-8a30-b15f57b45da5: durationMs=130748, startedAt=1792801101, completedAt=1792801231. Author clock boundaries 2026-10-24 00:18:22 to 00:20:21 UTC."
      },
      "summary": "F1 cleared after the replacement head was marked unverified and its timeout regression passed. The related minor failed-rollup regression was corrected before final clearance. Read-only dist reproductions returned exit 2 for an unverified green replacement and exit 1 for a failed replacement. No findings remain. Reviewer Vitest run was interrupted without a result; author focused suite passed 100/100."
    }
  ]
}
```
