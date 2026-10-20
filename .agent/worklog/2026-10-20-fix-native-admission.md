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
