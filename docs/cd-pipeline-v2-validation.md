# CD V2 design validation

2026-10-18. These are design probes, not production qualification.

`node --test qa/prototypes/cd-v2/protocol.test.mjs` passed 45 tests: six real
local-Git tests, two owned-child-process tests, 34 explicit protocol models and
three failure counterexamples.
The suite has no npm dependencies. It verifies concurrent sibling pushes,
reload/recompute after conflicts, lost acknowledgments after later head movement,
and the fact that old Git author/committer timestamps do not prove main age.

Two separately executed live GitHub probes on isolated private-consumer branches
each produced one accepted sibling update and three HTTP 422 rejections. They used
the same observed parent and `force:false`; no files changed and no workflows ran.
Both created branches were deleted, and subsequent GETs returned 404. Probe commits
remain subject to GitHub's normal unreachable-object garbage collection. The last
probe ran 2026-10-18 14:00:40–14:00:46 UTC. Private operational details remain in the
task evidence rather than the public repository.

The probes exposed constraints incorporated into the design:

- Nonforce Git updates are fast-forward checks. The adapter must create exactly
  one child of the observed head and prohibit merges/implicit rebase.
- Lost acknowledgment recovery searches durable effect identity even after
  another writer has advanced the head.
- Worker lease expiry does not release an uncertain upload reservation.
- Production eligibility needs trustworthy main-entry evidence and a defined
  missed-slot cutoff. Backdated commits do not qualify.
- Apple does not attest arbitrary Git SHAs: trusted build evidence must join
  source, IPA and operation identity to the exact provider build.
- Budget reservations bind immutable requests; settlement tombstones prevent
  replay charging or releasing twice. Unknown usage retains liability.
- Slot watermarks and delivery cursors advance atomically with their evidence.

The three counterexamples reproduce the bad outcomes of resetting oldest debt
on new merges, retrying uploads after lease expiry, and releasing budget on a
request timeout. Passing means those failure mechanisms are demonstrated.

The fresh review led to ten additional cases. An actual child paused after
authorization could still perform its external effect after its ledger fence
changed; a separate case terminated the owned child and confirmed exit/PID
absence before the replacement effect. Provider models expose terminal upload
failure without a build, preserve unknown status as uncertainty, coalesce only
never-started production slots, retain failed intent/quarantine across a daily
boundary and reject older out-of-order promotion. These models are separate from
the actual process/Git experiments and remain non-production evidence. Killing
a paused pre-call worker does not prove cancellation of an already in-flight
provider request; that still requires provider reconciliation.

Limits: model tests do not validate the future implementation, Apple eventual
consistency, Actions pagination, signing, hosted credentials, source evidence or
actual usage telemetry. Implementation adapter tests and the eight real delivery
campaign remain mandatory. No paid model calls or Apple uploads occurred in these
probes.

A full native baseline of current Evo main was also dispatched through the existing
test-only workflow while design review proceeded. Its outcome will be recorded in
the consumer acceptance evidence; it cannot count as a CD delivery.
