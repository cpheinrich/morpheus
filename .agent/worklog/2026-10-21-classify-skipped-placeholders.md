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
