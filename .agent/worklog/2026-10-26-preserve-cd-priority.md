---
roadmap: MO-26-10-26-20.05.22
tags: [engineering, devops, infrastructure]
---
# Preserve ordinary CD priority during recovery acceptance

## Mandate and design

Implement the bounded independently cleared source design, including SD1–SD4,
without selecting a consumer operation. The design manifest is
`9b80bee0d4d9fb0a685f8240509776bdf7094aedefad1c52700235e6c965f3a4`;
its follow-up design-clearance manifest is
`bc045113bd013dd063547d4b5e0f5d95d59ad4628af592dbe2e5d93a297a2bee`.
Those are design evidence, not an independent implementation review record.
The task's normal isolated claim is `73e0c86cec72450786aba5d8a6e457bb9d2de3bd`,
based on trunk `3ec4e72f406e3f1f90190cfc95bf01315b8cd7ed`. Work stayed in
that worktree. No native owner, old diagnostic task or original campaign record
was borrowed. Root retains publication and operations ownership.

Use the existing CD schema/reducers, Store and provider adapters. Closed Zod
records and one deterministic purpose journal are specific to this domain; a
second scheduler, generic authorization framework or dependency would add no
capability. Optional read limits use the existing fetch/AbortSignal boundary.
No package was added. No financial hold or grant-review admission was added;
the human's spend-as-needed policy and actual350USD cap remain unchanged.

## Change

- The normal Store origin API snapshots closed input, verifies exact replay and
  readback, and never enrolls an existing/ordinary intent. The separate result
  cannot match the old journal's `fenceBinding` shape. A caller must still verify
  real Git/iOS/history/review facts; an opaque reference is not source authority.
- New-effect admission samples current injected time inside every optional CAS
  retry. It checks current ordinary work, unevaluated due slots, unresolved
  repair/group owners, source/age/stagger/cursors and expiring state-fingerprinted
  facts. Initial dispatch freshness is distinct from later same-build recovery.
- Yield is zero-effect only. Origin, qualifications, yield and execution-release
  records are append-only. Stale direct dispatch and late upload claims cannot
  revive yielded/released authority. Exact existing upload receipts and matching
  test proof remain valid; committed receipt readback does not need a new window.
- Protected unknown uploads remain the SAME active source/build/IPA/claim through
  multiple timeout polls and diagnosis. Repair/adopt/retarget/retry is refused.
  Rejection is recorded without another optional attempt. Old retired uncertainty
  remains observation-only. Native occupancy can be released only with current
  exact terminal/quiescence/lease/fence/closure proof; provider outcome stays unknown.
- Optional B membership uses one stable purpose/group/build/attempt claim and the
  real Store invocation ownership/replay result. UNKNOWN plus absent readback
  never posts again. Positive readback recovers; ordinary group ownership/cursors
  remain separate. No new remote concurrency experiment is imposed.
- Internal ordinary work precedes optional and late work. Optional intents and
  late reads are bounded per tick, and optional Apple observation has a total
  deadline/request limit. This is ordinary-first policy, not a universal zero-delay
  promise or a new same-channel exemption for the original campaign.

## Actual validation and corrections

Initial new reducer coverage passed28/29; one expected error string had its word
order reversed and was corrected. The first controller fixtures ticked before the
seeded nextCheckAt and expected a receipt's buildNumber at its top level instead
of inside observation. These fixture errors were corrected with explicit zero-error
and due-time assertions; runtime assertions were not weakened. The initial wide
focused run then passed467 tests in11 directly related files.

Final source validation:

- `pnpm exec vitest run tests/cd/post-resume.test.ts tests/cd/post-resume-controller.test.ts tests/cd/post-resume-store.test.ts tests/cd/state.test.ts tests/cd/controller.test.ts tests/cd/store.test.ts tests/cd/adapters.test.ts tests/cd/external.test.ts tests/cd/worker.test.ts tests/cd/native-worker.test.ts tests/cd/request.test.ts tests/cd/repair-diagnostic-cli.test.ts`:486PASS in12 files, no skipped tests. The68 new tests cover the28 specification cases and concrete boundaries/replays.
- `pnpm typecheck`:PASS. `pnpm compile`:PASS, generated dist committed.
- `pnpm morpheus pm index`:PASS; existing generated indexes unchanged.
- `git diff --check`:PASS.
- Three targeted final-source mutants were actually assertion-killed: removing
  optional adoption protection, reusing a captured CAS clock, and ignoring fresh
  group claim ownership. Each source file was restored and its exact hash checked.
  Earlier mutation evidence is retained separately from final qualification.

The final optional read-bound addition initially passed explicit undefined limit
arguments on ordinary adapter calls; nine exact existing-call-shape regressions
failed. The source now preserves ordinary call arity and default behavior. Those
unchanged assertions and the complete focused scope passed on the final source.
Four-artifact boundary tests run a private hermetic fake gh, never a real provider
command; pagination/abort tests refuse UNKNOWN instead of returning empty success.
Raw final logs, mutation outcomes and a machine-readable packet are retained in
this task worktree's ignored `local/post-resume-validation/` directory.
No full local suite is appropriate: this changes CD modules, not the listed
shared-core directories. Full required CI remains Root's later publication step.
No CI, provider/host/ledger/credential/service operation, reviewer/model session,
source push or PR was performed by this author.

## Authorizing-writer inventory and limits

`planAttempt` -> Controller.reconcileIntent; Controller.dispatch -> Actions.dispatch;
`claimUpload` -> both CLI before-upload routes; `recordTests`/`recordUpload` -> CLI
and controller evidence/readback; `claimGroup` -> ordinary internal controller path;
new optional membership -> one stable owned Store claim; `deliver` -> normal receipt;
`adoptRepair`/`completeOperationalRepair` -> worker result adoption; `repairWork` ->
controller/CLI; local and hosted worker admission -> guarded ordinary repair paths.
External follow-up effect claims also recheck optional current-state admission.
The duplicate/deadline cancellation writers retain normal ordinary behavior, but
refuse new optional cancels; no optional cancellation operation was selected.
The normal Store invocation owner/replay algorithm is reused unchanged.
Final inspection found the existing Actions pagination/evidence path still
unbounded. Root explicitly authorized the necessary narrow actions.ts scope
expansion. Optional GET sweeps now cap requests/deadline; artifact downloads share
an abort deadline and four-download limit. The default ordinary adapter retains
its existing behavior. A limited/aborted census refuses as UNKNOWN, not empty.

Parent/critic Tier2 graph generation was2026-10-27T01:00:36Z. This author's bounded
positive searches/traces found the existing callers above, with complete returned
pages. Subsequent coverage reported generation2026-10-27T03:05:32Z and clean
metadata for the known source/dependency paths; controller.test.ts line13 was
partial and read directly with its harness. External/native worker harness partial ranges14/16 were also read directly.
New test paths are absent from the primary-checkout graph and were authored/read
in full in this worktree. New code is verified from the exact owned worktree; graph coverage is best-effort and is not a whole installed-runtime
or writer inventory proof.

The implementation does not verify real Git tree semantics from hash strings,
choose an operational target/window, arm faults or supply an installed Evo
consumer/journal adapter. Future consumer source/caller/import/runtime qualification
and actual relevant input remain separate work. Original campaign8, its old helper,
resumes/holds and active/per-channel interpretation are not rewritten. No ordinary
validation=false fault enrollment, native max/config/epoch/quota change, source-age
waiver, financial hold or fabricated acceptance is introduced.

## Handoff

The source is ready for Root's independent exact-implementation review; no review
record or implementation clearance is asserted here. Root owns any source push,
PR, required CI, protected merge and consumer/runtime operation. The actual
ordinary delivery observer and native repair/source owners were not queried or
changed. All future operational source/target/window/fault/run/IPA/build/nonce/
release bindings remain unselected. The design's completed review is not reused
as implementation review or effect authority.
