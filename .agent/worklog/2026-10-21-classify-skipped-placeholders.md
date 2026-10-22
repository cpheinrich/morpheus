---
roadmap: MO-26-10-21-20.30.42
---

# Terminal job placeholders in the no-start census

The controller's no-start rule required a null `started_at`. Retained GitHub rows show something
different for terminal jobs that never reached a runner:

- Skipped rows, and one ordinary iOS job cancelled after 24 minutes in the queue, copy `created_at`
  into `started_at`.
- They list no steps.
- Their runner and runner-group fields are null when skipped and `0`/`""` when cancelled.

As a result, a terminal run was routed to repair rather than the designed hosted fallback. The run
had a native job cancelled before assignment, a successful preflight, and real-shaped skipped
downstream rows.

The fix adds one terminal predicate, `neverRan(job, conclusions)`. It requires status
`completed` and an allowed conclusion, then accepts a row in either of two cases:

- the row passes the unchanged strict rule;
- the row meets all of the following:
  - it has a completion time;
  - `started_at` is a string-exact copy of `created_at`;
  - runner and runner-group fields are null or 0/empty;
  - it lists no steps.

Skipped companions and the native cancelled/skipped census use it. The queued branch of the
admission census keeps `unassigned()`, `knownJob` is unchanged, and no field becomes newly
required outside the placeholder path. The design and boundary matrix were committed before
the tests (`5b2c8d24`), and the tests before the fix (`72029431`).

## Evidence and provenance

- **Retained raw files.** Read locally, not copied, not modified. They are identified by sha256 in
  the acceptance file:
  - staging census `c413789a…`;
  - production census `284564f5…`;
  - cancelled job `134cca85…`.
- **Prior assessment.** An offline assessment (`4ff0d340…`) counted 20 unique never-assigned
  skipped rows with this shape across 37 retained files.
- **No provider calls.** No provider, repository, runner or host call was made by this task.
- **Public schema.** GitHub's public REST description `api.github.com.json` (sha256
  `3177ad6a…`) was fetched unauthenticated. It declares `created_at`/`started_at` required and
  non-null, and the runner fields "null until assigned". Its job example omits `created_at`.
- **Conditions guide.** It says only that a false `if` marks a job skipped.
- **What the docs do not settle.** Neither documents the never-ran timestamp, so the rule rests
  on the observed rows. This is also why `created_at` stays optional outside the placeholder.
- **Graph check.** `trace_path` on project `Users-chrisheinrich-code-morpheus` (generation
  2026-10-22T03:30:46Z, full, complete, metadata_match) gives `jobAdmission` inbound callers
  `failedRun` and `reconcileIntent` only, with `tick` at depth 2.
  - Coverage reports `src/cd/controller.ts` with no recorded issue. Line 13 of
    `tests/cd/controller.test.ts` is parse_partial; it is the `vi.mock` line, which was read in
    full.
  - This exact worktree is not indexed. The primary checkout's `controller.ts` equals
    `41d9815`, as does this branch's base.
  - An exact grep confirmed that no other source or test references `jobAdmission`,
    `unassigned`, `knownJob` or `WorkflowJob`.

## A changed existing expectation

One existing case changed outcome: "retains the test bound and ownership for started job
evidence" overrode only `started_at: now`. The fixture's default `created_at` is also `now`, so
that row was exactly the creation-time placeholder (cancelled, no runner, no steps), which the
new rule accepts by design. The case now starts one minute after creation and keeps its intent:
a real start refuses. It no longer covers the equal-timestamp row. The new matrix covers that row
explicitly: accepted only with the full shape, and refused at ±1 s, for another spelling of the
same instant, and for each missing guard field.

## Validation

- **Baseline.** On the unchanged main source with the new tests, exactly two cases fail by
  assertion. The real-shape census gives `run-repair-agent` instead of `dispatch-hosted`, and the
  skipped placeholder companion blocks the 15-minute admission cancel. 87 pass.
- **Corrected source.** 89/89 pass in `tests/cd/controller.test.ts`.
- **Mutants.** 18 targeted mutants of each placeholder clause, the queued census and the companion
  rules were all killed by assertion failures, with no suite errors. Survivors: none. The
  identity-only alternative from the assessment (ignore `started_at`) is mutant M05; seven cases
  kill it.
- **Projection check.** A local check confirms the fixtures are exact-field projections of the
  retained rows, and that the raw hashes are unchanged before and after.
- **Location.** The mutation and projection scripts and reports are local packet files, not
  repository files.

No hosted delivery, drill, runtime adoption, runner or queued-row behaviour is claimed. The
following remain unknown and fail closed unless they match the exact shape:

- the drill target's cancellation shape;
- live queued rows;
- whether a cancelled run's dependents report `skipped` or `cancelled`;
- an assigned runner that never reported.

## Delivery and independent review

The branch was pushed once at `09179134`, which is `e4ae2785` plus a records-only commit moving
the item to `review`. Draft PR #448 was opened without the `agent-reviewed` label and with
auto-merge off. Its only CI run, 39721274956 (attempt 1, exact head), succeeded:

- qa-browser, `node / check`, codex-claude and `pm / pm` passed;
- `pr` and both `agent-review` jobs were skipped by design.

One fresh high-risk reviewer then reviewed `09179134`. It ran as a general-purpose subagent with
no inherited history, from a 26 KB dispatch file containing the full `review prepare` packet, the
CI result and seven author disclosures. Timing: the runner's `duration_ms` was 340148. The author's
clock read 04:17:49.639Z to 04:23:39.186Z around the invocation; the reviewer's own readings
were 04:18:04Z and 04:23:05Z.

Its one minor finding, MIN-01, was correct. Skipped companions share `neverRan` on the hosted lane
too. As a result, an all-completed census with no local job and a real unlabelled skipped
placeholder now records `hosted-terminated`. The acceptance file had listed hosted-lane
termination as unchanged, and no test covered it.

The behaviour is kept. `ae713540` adds a hosted-lane boundary test and corrects the requirement
and docs, under the reviewer's condition. That test passes on the head (91/91) and fails on the
base source (`expected 'active' to be 'failed'`), and typecheck passes. No source or generated
file changed. The fix is local and unpushed; a second push and CI await separate release.

A fresh high-risk independent reviewer (claude-code-subagent/add7f3079364dc160) reviewed 09179134 against CI run 39721274956 and the retained rows, and cleared it with one minor finding. MIN-01: skipped companions share the new predicate on the hosted lane, so a completed census with no local job beside a real unlabelled skipped placeholder now records hosted termination, which the acceptance file had listed as unchanged and no test covered. The reviewer judged that behaviour correct and set a condition limited to the test, acceptance, docs and worklog paths. The author added a hosted-lane boundary test that passes on the head and fails on the base source, and corrected the requirement and docs in ae713540 with no source change. The reviewer judged the malformed equal date-pair case acceptable without a test, the changed existing expectation sound, and the waiting-gate change acceptable. It noted as incidental that a runner pickup within the creation second could produce an equal start; the blank runner, group and step guards still refuse that row, and it falls within the disclosed unknown about an assigned runner that never reported. Live queued-row shape, the drill target's cancellation shape and runtime adoption remain unverified.

```morpheus-review
{
  "version": 2,
  "base": "41d9815dd719e9b7106c3cd17ed2e81e15201a88",
  "reviewed": "09179134b8236e7e831dad9ceaf8b33b94eb1270",
  "covered": "ae71354066920cde9a845ebdbd880d072a9c1a65",
  "authorSession": "1d30e53f-94d3-441a-aeea-b031a044a7be",
  "reviewerSession": "claude-code-subagent/add7f3079364dc160",
  "risk": "high",
  "elapsedMinutes": 5.669133333333333,
  "timing": {
    "source": "runner",
    "durationMs": 340148,
    "evidence": "Claude Code Agent tool result for subagent add7f3079364dc160, initial turn: duration_ms=340148. Author clock around the invocation 2026-10-22T04:17:49.639Z to 2026-10-22T04:23:39.186Z; reviewer date -u readings 04:18:04Z and 04:23:05Z."
  },
  "outcome": "complete",
  "summary": "A fresh high-risk independent reviewer (claude-code-subagent/add7f3079364dc160) reviewed 09179134 against CI run 39721274956 and the retained rows, and cleared it with one minor finding. MIN-01: skipped companions share the new predicate on the hosted lane, so a completed census with no local job beside a real unlabelled skipped placeholder now records hosted termination, which the acceptance file had listed as unchanged and no test covered. The reviewer judged that behaviour correct and set a condition limited to the test, acceptance, docs and worklog paths. The author added a hosted-lane boundary test that passes on the head and fails on the base source, and corrected the requirement and docs in ae713540 with no source change. The reviewer judged the malformed equal date-pair case acceptable without a test, the changed existing expectation sound, and the waiting-gate change acceptable. It noted as incidental that a runner pickup within the creation second could produce an equal start; the blank runner, group and step guards still refuse that row, and it falls within the disclosed unknown about an assigned runner that never reported. Live queued-row shape, the drill target's cancellation shape and runtime adoption remain unverified.",
  "findings": [
    {
      "id": "MIN-01",
      "severity": "minor",
      "description": "Skipped companions share neverRan on the hosted lane: a terminal skipped placeholder labelled neither ubuntu- nor macos- (the real unlabelled tests row) now makes the census recognized, so an all-completed census with no local job sets hostedEnded and records hosted-terminated quiescence (src/cd/controller.ts skipped, recognized, hostedEnded). The acceptance file listed hosted-lane termination as unchanged and no test covered it.",
      "paths": ["tests/cd/controller.test.ts", "qa/acceptance/MO-26-10-21-20.30.42.md", "docs/cd-pipeline-v2.md"],
      "disposition": "fixed",
      "response": "Agreed; kept the behaviour, which the reviewer judged correct because every job completed, none is local and a skipped row never ran. Added an admissionHarness hosted-lane case pinning both sides of the start-time boundary: the exact placeholder gives hosted-terminated quiescence, a failed attempt, run-repair-agent, no dispatch and no not-proved evidence; a start one second after creation leaves the attempt active with not-proved evidence. Corrected the acceptance requirements and the docs paragraph in ae713540, with no src/ or dist/ change.",
      "condition": {
        "paths": ["tests/cd/controller.test.ts", "qa/acceptance/MO-26-10-21-20.30.42.md", "docs/cd-pipeline-v2.md", ".agent/worklog/2026-10-21-classify-skipped-placeholders.md"],
        "evidence": "pnpm exec vitest run tests/cd/controller.test.ts with the new case passing on head and the same case failing on the base source; pnpm typecheck"
      },
      "conditionMet": "On ae713540: pnpm exec vitest run tests/cd/controller.test.ts passed 91/91. With src/cd/controller.ts temporarily replaced by the 41d9815 version and then restored from Git, the exact-placeholder hosted case failed (expected 'active' to be 'failed') and its one-second counterpart passed. pnpm typecheck exited 0."
    }
  ]
}
```

## Late CI correction: a controlled clock for the upload boundary

### What failed

The ready-for-review run 39724029142 on `24e2e58d` failed `node / check` in one test. The
test is `tests/upload-receipt.test.py` `test_known_acceptance_survives_polled_resource_hook_failure`,
in its `COMPLETE` case, which expected return code 11 and got 1 ("Timed out confirming upload
acceptance"). The synchronize run on the same head passed.

Here is the mechanism:

- `upload-effects.sh:51` sets `acceptance_deadline` from `date +%s` plus
  `PROCESSING_TIMEOUT_SECONDS`.
- `upload-effects.sh:53` checks `date +%s -ge deadline` before every poll.
- The harness runs that boundary on the real clock, with a 1-second timeout and a 0-second poll.
  A whole-second deadline then leaves a window of anywhere between almost nothing and one second.
- If a second boundary falls between the two `date` reads, the loop times out before it polls
  even once.

Three cases enter that loop expecting a poll. They are the two polled-resource subtests and the
awaiting-upload `PROCESSING` case.

### Requirements

1. **Production unchanged.** No production file changes, including anything under `.github/`.
   The deadline arithmetic, the `-ge` guard, the exit status and the message are the reviewed
   behaviour, and the tests keep executing those exact lines.
2. **Controlled clock in the harness only.** The harness gives the boundary a controlled clock:
   - `date +%s` returns harness time.
   - `sleep N` advances harness time by N whole seconds without waiting.
   - Any other `date` call uses the real command.
   - A non-integer sleep fails loudly.

   The functions live only in the test's `bash -c` prefix. Production sources
   `upload-effects.sh` from `upload-testflight.sh`, which defines neither function.
3. **Assertions preserved.** Every existing assertion stays: exit codes, call order, receipts,
   identity and digests.
4. **Production-valid poll interval.** The poll interval becomes 1. `upload-testflight.sh:120-121`
   rejects anything that is not a positive integer, so the old `0` was an input production never
   runs with. The timeout stays 1.
5. **Exact boundary coverage.** With a 3-second timeout and a 1-second poll, a resource that is
   never accepted is polled exactly three times. It then exits 1 with the exact message, no
   acceptance and the persisted `AWAITING_UPLOAD` resource. The checks at +0, +1 and +2 each
   poll; the check at +3 equals the deadline and stops.
6. **Bounded process guard.** Every boundary process gets a timeout. A regression that stops
   advancing the clock then fails instead of hanging.
7. **Proof of the fix.** The evidence must show four things:
   - The unchanged old harness fails on a forced second crossing, reproducing the CI failure.
   - The new harness passes under the same forced clock.
   - Mutants of the production deadline are detected.
   - Repeated runs are stable.
