---
roadmap: MO-26-10-22-20.39.59
---

# Wait safely for empty external TestFlight groups

## Diagnosis and design before implementation

A normal controller continuation exposed the existing tester-count invariant on
an already internally delivered build. Prior consumer documentation deliberately
allows an existing external group to have zero testers; it did not change the
shared controller. Empty is expected pending, not authority to invite testers or
claim external availability. Root accepted this narrow source design before edits.

Fresh normal two-stage claim from actual main2c7250bc created a new isolated task;
the prior classifier task checkout/objects remain untouched. No source publication,
CI, reviewer, provider or operational command is part of this local PhaseA.

The changed guard retains exact receipt/build/app/group count/identity, external
type and all-build access restrictions. It checks tester evidence as an array of
nonblank IDs, allowing zero only as a waiting condition. Existing unsafe/unknown
build-state classification runs first. The new pending/wait-external-testers
branch records the exact observation and normal poll deadline, then returns before
notify, membership, review or dispatch. Later populated evidence resumes existing
once-only flow. Internal receipts/cursors/attempts/budget/agents and unresolved
review history retain their prior semantics. No new dependency, config/schema,
provider adapter, store, retry framework or optional refactor is needed.

## Evidence and limitations

Tier2 graph project Users-chrisheinrich-code-morpheus was ready8573/25369;
coverage generation2026-10-23T03:39:30Z is best effort. Controller/apple/schema,
adapters/state/fixture paths have metadata_match/no recorded issue. External and
controller tests have parser gaps at lines14 and13 respectively; both exact mock
ranges and relied source were read directly. The private new worktree and generated
dist are not graph proof. Exact base/new source is authoritative; no completeness
or provider execution claim is made. One exploratory apple.test.ts path was absent;
the actual direct adapter tests are adapters.test.ts and passed below.

The consumer's reviewed empty-group work was documentation-only. Its current
control-only main still retains the wait policy and pins the preceding reviewed
controller; this new source does not install itself or advance an existing runtime.
Source publication/adoption must remain separately coordinated after the ongoing
ordinary delivery, preserving its carrying source. No actual availability or new
receipt is fabricated from the tests.

## Actual local qualification

- Initial new external checks:45 passed. After both-channel and uncertain-claim
  coverage, external+controller:174 passed; typecheck exited0.
- The original main2c controller fails12 assertions in the new48-test external
  file. Failures, including the original invariant error, are retained privately.
- Seven targeted mutants are killed by assertion failures: missing zero wait,
  continuing into mutation after waiting, premature availability, malformed tester
  acceptance, foreign group acceptance, empty masking terminal state, and reporting
  expected waiting as a tick error. Final source was restored and hash-checked.
- Final restored direct-dependent suite:227 passed across external, controller,
  adapters and state;0 failed/skipped. It covers zero/nonzero/poll boundaries,
  both channels, multi-group waiting/resumption, exact once-only review and immutable
  internal evidence. The adapter/state tests use their normal local-only fixtures;
  a temporary local Git remote is not a provider operation.
- Compile, PM index, PM validation and diff checking exited0. The full local suite
  was not run: shared PM/check/session/review/template code is unchanged. CI and a
  fresh independent review remain unstarted and required before any merge.

Publication/fresh-review/CI/merge/install/adoption remain held. The normal claim
push contains claim records only. No live host, service, worker, VM, ledger,
credential, arm/request/cancel, observer or provider effect occurred.
