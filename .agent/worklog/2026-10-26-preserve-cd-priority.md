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


## PR530 initial independent implementation review and correction

The initial independent implementation review was **blocked**, despite the prior
passing tests. The five findings were substantive source defects. Reviewer
`/root/post_resume_cd_implementation_review_530` report JSON SHA-256
`e4b0675eb855a39a8b45e2e280204cb2a753394ce1d3ca1bff6680f2950b211e`
and manifest `f3916c3247b7450112f1cfce95886b657e437d57dc8f3c556e5d41b44757bbb0`
were authenticated in full. This correction starts from Root's published
`e67028a902da7bd7e8fb09110bcc5d69ed580884`, preserving its roadmap status metadata
and the original review/validation history. No different task or reviewer is used.

- **IR-01 fixed:** a vanished-demand yield proposal throws before the Store can
  commit the stable transition. A genuine later yield remains possible. The real
  CAS interleaving completes an actual synthetic ordinary receipt between the
  selector and callback, then proves both ordinary channel plans fit after yield.
- **IR-02 fixed:** optional receipt creation no longer writes ordinary group
  cursors or group ownership. Whole ordinary cursor/owner/fence comparisons and
  subsequent valid ordinary delivery prove the isolation; a genuinely newer
  completed ordinary receipt still prevents a first old optional receipt.
- **IR-03 fixed:** neither rejection writer marks an unquiesced optional executor
  failed. Rejection is recorded honestly on the same spent upload, but occupancy
  remains counted until authenticated release. The transition invariant and
  occupancy helper also preserve this distinction; ordinary accepted fast release
  is unchanged. Both writer paths and post-release normal capacity are exercised.
- **IR-04 fixed:** the native/archive verification gate rejects released/yielded
  authority before validation, in every new CAS callback and at optional replay
  readback. `verifyExecutionFacts` is internal factual validation;
  `verifyExecutionProvenance` returns only `verified` and creates no native claim.
  The public native CLI/direct function and both before-upload callers retain
  execution authorization; optional full-test evidence uses provenance followed
  by immutable `recordTests`. Ordinary full-test recording retains its old native
  verification path. Existing resource/after upload receipts remain exact-claim
  observations. Tests cover fresh/replayed gates and release during validation.
- **IR-05 fixed:** delivered optional external observation uses one shared bounded
  Apple API across build, review, every group and all pagination/body reads.
  Exhaustion/abort is UNKNOWN, never partial mutation authority. A valid-config
  eight-GET test and stalled-body test exercise the real external adapter. The
  ordinary three-argument path still completes its unchanged multi-page behavior.

No new financial hold, native config/quota change, actual target/window/fault,
source adoption, provider/host/native/ledger action or publication was selected.
The same reviewer must assess the corrected exact source; author fixes and these
regressions are not independent clearance. The correction validation follows.


### Correction validation and retained failure

The final changed runtime passed the direct12-file CD scope: **500 tests passed,
zero skipped**. The command covered post-resume state/controller/store, ordinary
state/controller/store/adapters/external, worker/native-worker, request and
repair-diagnostic CLI tests. This is focused dependency coverage, not the full
repository or native iOS suite. `pnpm typecheck`, `pnpm compile`,
`pnpm morpheus pm index` and `git diff --check` passed. Index generation reported
all three indexes unchanged; compilation refreshed only the affected CD outputs.

Final inspection strengthened IR-02 to preserve an actual synthetic pre-existing
ordinary production receipt, completed group ownership and its cursor/fence
objects, rather than an empty receipt set. Its first added fixture incorrectly
used the helper's default build7 for an actually allocated build8 and failed
`Reserved app/version/build or IPA digest mismatch` (34passed/1failed). The fixture
now binds the actual allocated number, and the failure log remains retained.
No production source correction was needed. The final three post-resume files
then passed **82 tests/zero skipped** on the strengthened fixture; typecheck passed
again. The broader500-test run remains valid for the unchanged corrected runtime.

Six distinct targeted mutations each failed actual assertions, not setup/errors:
null yield tombstone; optional shared group cursor; rejected-as-failed; omitted
native authority guard; omitted current replay readback; unbounded external
observation. All six runtime files were restored to their recorded hashes. IR-02
was also requalified after the receipt-fixture strengthening and was again killed
by the cursor-isolation assertion. Filtered mutant runs deliberately skip other
tests; these are mutation probes, not qualified full test inventories.

Exact commands, logs, restoration hashes, failure history and the correction
source/commit manifest are retained in ignored `local/post-resume-validation-ir/`.
The packet names each IR regression and preserves the initial blocked review.
This author did not push, perform CI, open/change a PR, start a reviewer or mutate
any provider/host/native/ledger/credential/service. Root owns the same reviewer's
remaining ordinary follow-up and the protected publication lifecycle.


## Independent implementation review and same-reviewer correction

The initial high-risk implementation review was complete and blocked on five substantive findings (IR-01 through IR-05). The same author corrected the real yield CAS race, ordinary group-cursor isolation, rejected-executor occupancy, fresh/replayed native authority, and bounded optional external reads. The same reviewer cleared all five fixes at 1a78ef0f6db24dd8d80d7f44fc846ab3aac0e41c with original severities retained and no new findings. Independent correction checks passed 14 targeted tests and matched all 12 correction-generated outputs. This is source clearance; required CI, protected merge, future consumer/runtime qualification and empirical recovery acceptance remain separate.

The original initial report remains blocked in history; its five substantive findings are preserved below as fixed following the same reviewer’s ordinary follow-up. Initial clock duration was20.916666666666668minutes; follow-up was4.5minutes. The author correction packet retains all29 payloads, 500 direct tests before the final stronger IR02 fixture, 82 final strengthened tests, six distinct assertion-killed mutants plus the stronger IR02 requalification, and the corrected allocated-build fixture failure. No live effect or runtime adoption was performed.

```morpheus-review
{
  "version": 2,
  "base": "3ec4e72f406e3f1f90190cfc95bf01315b8cd7ed",
  "reviewed": "e67028a902da7bd7e8fb09110bcc5d69ed580884",
  "covered": "1a78ef0f6db24dd8d80d7f44fc846ab3aac0e41c",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/post_resume_cd_implementation_review_530",
  "risk": "high",
  "elapsedMinutes": 20.916666666666668,
  "timing": {
    "source": "clock",
    "durationMs": 1255000,
    "evidence": "Parent clock readings for initial invocation /root/post_resume_cd_implementation_review_530: start 2026-10-27T04:15:09Z, terminal completion observed 2026-10-27T04:36:04Z, including tools and waits. Initial complete BLOCKED report/manifest retained with SHA e4b0675eb855a39a8b45e2e280204cb2a753394ce1d3ca1bff6680f2950b211e / f3916c3247b7450112f1cfce95886b657e437d57dc8f3c556e5d41b44757bbb0."
  },
  "outcome": "complete",
  "summary": "The initial high-risk implementation review was complete and blocked on five substantive findings (IR-01 through IR-05). The same author corrected the real yield CAS race, ordinary group-cursor isolation, rejected-executor occupancy, fresh/replayed native authority, and bounded optional external reads. The same reviewer cleared all five fixes at 1a78ef0f6db24dd8d80d7f44fc846ab3aac0e41c with original severities retained and no new findings. Independent correction checks passed 14 targeted tests and matched all 12 correction-generated outputs. This is source clearance; required CI, protected merge, future consumer/runtime qualification and empirical recovery acceptance remain separate.",
  "findings": [
    {
      "id": "IR-01",
      "severity": "substantive",
      "description": "A no-op yield becomes a permanent tombstone and prevents later ordinary-priority yielding. A never-dispatched optional attempt sees ordinary demand. Before its yield CAS callback runs, the last ordinary operation completes. The callback returns null at line 250, but GitHubStore commits the stable post-resume-yield-<attempt> transition with result:null. When new ordinary demand arrives, every attempt to yield replays that null transition without executing yieldPostResumeAttempt. The optional plan remains active and occupies a native slot indefinitely while demand is present; two ordinary channels then cannot both reserve the two real slots, although this optional attempt has never dispatched.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/store.ts"
      ],
      "disposition": "fixed",
      "response": "The vanished-demand callback throws CdWait before GitHubStore can write the stable yield transition. No null tombstone exists to replay. A later real demand can commit the one immutable zero-effect yield, retaining the burned build. The regression interleaves a genuine ordinary receipt between selection and callback, then creates both ordinary channels and proves both plans fit after the later yield. Independently passed the new real Store/controller race regression. Read the assertion-killed null-tombstone mutant log; its promise incorrectly resolves after the defect is restored. The ordinary catch/wait path preserves the existing bounded poll policy; no zero-delay guarantee is inferred."
    },
    {
      "id": "IR-02",
      "severity": "substantive",
      "description": "Optional receipt creation mutates the ordinary group cursor. deliver() correctly skips the channel cursor for validation work, but unconditionally replaces groupCursors[intent.groupId] with the optional receipt. In the new additive B route that is the live ordinary internal group. After optional source order 1 delivers over ordinary cursor order 0, a later valid ordinary request for order 0 is admitted by createIntent and planAttempt and uploads successfully, then claimGroup refuses with 'Group promotion would regress the live cursor'. This changes ordinary behavior and contradicts SD3 and the new documentation's unchanged ordinary cursors contract.",
      "paths": [
        "src/cd/state.ts"
      ],
      "disposition": "fixed",
      "response": "The post-resume receipt now records its own receipt and optional membership observation without writing shared groupCursors or completing ordinary groupOperations. Legacy/ordinary behavior remains on the existing branch. Both ordinary and group monotonic guards still run before the first optional receipt. Strengthened regressions preserve an actual pre-existing ordinary production receipt, complete ownership, cursors and fences, allow the later valid ordinary staging promotion, and reject a first old optional receipt after a newer completed ordinary receipt. Independently passed both IR-02 regressions, including the strengthened existing ordinary receipt fixture. Read the strengthened cursor mutant's exact whole-object comparison failure. This is stronger than checking an empty receipt set or only the channel cursor."
    },
    {
      "id": "IR-03",
      "severity": "substantive",
      "description": "Provider rejection releases optional native occupancy without executor quiescence. Both rejection writers mark the optional attempt status='failed' immediately. occupiesNative() then returns false based on status, even when workflowTerminalAt, owned quiescence and the execution-release record are all absent. A definitive provider rejection says what happened to the upload, not that the native executor/uploader and descendants have stopped. Two ordinary attempts can consequently be planned while that unquiesced optional executor still exists, exceeding the actual maxNativeJobs=2 resource contract. The acceptedAt exception is explicitly retained by the design; rejection has no corresponding executor proof.",
      "paths": [
        "src/cd/state.ts",
        "src/cd/controller.ts"
      ],
      "disposition": "fixed",
      "response": "Both receipt and controller rejection writers retain the same active optional execution and honest rejected upload. The invariant refuses failed/retired unreleased optional uploads, and the occupancy predicate conservatively counts rejected optional execution until exact release. Release remains tied to the bound run, terminal/quiescence proof, owner/fence and closure. After release, both normal slots can be admitted without creating another optional attempt/purpose. Ordinary accepted-upload fast release remains unchanged. Independently passed both writer-path regressions: before release the second ordinary plan fails capacity; exact release frees the same rejected identity and the later ordinary plan succeeds. Read the rejected-as-failed mutant's actual active-status assertion failure and the unchanged source-side no-retry guards."
    },
    {
      "id": "IR-04",
      "severity": "substantive",
      "description": "The documented native execution gate still grants authority after execution release. verifyExecution is the exported/CLI gate consumers are instructed to call before native work and archive. It checks immutable identity and pauses, then commits/replays a verify transition and returns authorized:true. It never checks the new execution-release record. A released optional attempt deliberately remains active for same-upload receipts, so checkIdentity still succeeds. A stale/direct preflight call for that exact released identity can therefore regain native/archive authority while the attempt is excluded from native occupancy. Protecting claimUpload later does not prevent this native work.",
      "paths": [
        "src/cd/cli.ts",
        "docs/cd-v2-controller.md"
      ],
      "disposition": "fixed",
      "response": "New native/archive authorization is checked before factual validation, inside every new verify CAS callback with fresh current time, and again on optional current-state readback because Store replay skips the callback. Released/yielded authority cannot return authorized:true, including when release wins during provider/provenance reads. The separate provenance helper returns only verified:true and writes no verification claim. The optional full-test recorder uses that observation helper followed by immutable recordTests; ordinary test recording and the native/before-upload callers retain verifyExecution. Existing upload resource/after receipts remain observation-only exact-claim paths. Independently passed fresh/replayed release tests, release-during-validation CAS/readback tests, and yielded direct/CLI gate tests. Those cases also prove matching existing proof/accepted resource receipts still append after release and leave verification claims unchanged. Read both native-gate and replay-readback assertion-killed mutant logs. Graph baseline identified the old CLI caller; new helper/caller closure was read directly because the primary index does not contain the correction."
    },
    {
      "id": "IR-05",
      "severity": "substantive",
      "description": "Delivered optional external follow-up bypasses the new observation budget. The new origin is uncounted validation with isolatedValidation=false, so when externalGroupIds is configured it enters reconcileExternal after delivery. That method calls AppleAdapter.external without a bounded API; external/group/Apple pagination has no request-count or shared observation deadline. The new optional limit is applied to maximum/observe only. A large or continually paginated external membership census can consume arbitrarily many serial requests and keep the tick from completing, delaying the next ordinary reconciliation and CLI scheduleHosted step despite the promised finite optional work.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/apple.ts"
      ],
      "disposition": "fixed",
      "response": "The delivered post-resume route now supplies one shared eight-GET/30-second Apple observation budget across the build, review, groups, pagination and response-body reads. Exhaustion/abort produces CdWait and the optional external state remains uncertain without mutations from partial data. The ordinary three-argument external call and default adapter remain unchanged. Independently passed the eight-request no-mutation/UNKNOWN case, stalled response-body shared-deadline case, and ordinary complete ten-membership-page compatibility case. Read the unbounded-external mutant assertion, which reaches the sentinel instead of the expected budget refusal. Promise.all group work shares the same wrapper/counter/deadline."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/post_resume_cd_implementation_review_530",
      "commit": "1a78ef0f6db24dd8d80d7f44fc846ab3aac0e41c",
      "outcome": "cleared",
      "elapsedMinutes": 4.5,
      "timing": {
        "source": "clock",
        "durationMs": 270000,
        "evidence": "Parent clock readings for ordinary fix follow-up1 of /root/post_resume_cd_implementation_review_530: start 2026-10-27T05:08:10Z, actual terminal completion observed 2026-10-27T05:12:40Z, including tools and waits. Authenticated report SHA5a786042b07f30e151871f909cbd6dc1e959f0e1c589ba3c44ae51783ec7a1e9; manifest SHA60688ecf1f2762728fc5c4f900c0415fe2bc712ddcc320dd7d19c77f2e037608."
      },
      "summary": "Same reviewer verified all five substantive fixes and their affected caller paths at the corrected commit; original priorities/severities retained, no new findings or conditions. Independent targeted correction run:14PASS/21intentional name-filter exclusions. All12 changed generated outputs matched fresh in-memory compiler emit. Required CI and later runtime/live acceptance remain outstanding."
    }
  ]
}
```
