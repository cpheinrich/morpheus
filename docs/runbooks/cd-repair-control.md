# CD repair-only control

**Read when** you need to stop new repair-agent work for one exact supplemental validation intent while its delivery, fault and receipt paths keep running.

## What it is
A hold is an entry in the existing `state.pauses` array with scope `repair:<intentId>`. The existing intent, channel and `all` pause gates match scopes exactly, so they ignore it. Only the held-aware worker entry and the guarded store read it. Code: `src/cd/repair-control.ts` (the pure leaf; its imports are type-only and the hash and store are injected), `src/cd/repair-control-entry.ts` (the operator grammar) and `src/cd/worker-only-entry.ts` (wraps an **injected, unchanged** `runWorker`).

## Rules
- **Hold** (`repair-hold-<operationId>`). Refused unless all of these hold inside the fresh CAS callback on every retry:
  - the target is an existing, undelivered validation intent bound to the exact closed `supplemental-wake-probe` creation transition (intent, campaignRef, operationId);
  - the epoch matches;
  - the target has zero attempts, no repair work and no owner;
  - no hold exists for it already.

  `observedHead` is advisory metadata, not a compare-and-swap head.
- **Release** (`repair-release-<operationId>`). Allowed only after the exact delivered receipt, with all target work complete, no lease and every invocation ended. Normal `deliver` already marks all target work complete. Release removes only the exact hold entry; foreign pauses are untouched.
- **Exit codes cover returned results only.** 0, 3 and 2 describe what `runRepairControl` returns for committed, replayed and refused requests. A malformed `repair:` control in the ledger makes the call throw `RepairControlInvalid` (no output line, nothing written, fail closed), and a store error can also throw; the caller must catch both. The entry does not promise that an arbitrary store error wrote nothing.
- **Results** are `{kind, entry, request, requestDigest}`, with the closed request nested and a full SHA-256 digest. Never put `campaignRef`, `action`, `fenceBinding` or `kind: supplemental-wake-probe` at the top level: the consumer journal would read that as a creation row.
- **Replay and readback.** The store returns a replay without running the callback, so the stored digest is compared after every return, and a fresh readback must show the entry present (hold) or absent (release). Exit codes: 0 committed, 3 identical replay, 2 refused. An old hold retried after its release exits 2.
- **Worker gate.** Only `agent-budget-wait`, `claim-agent-invocation` and `claim-hosted-agent-dispatch` are guarded, with a typed abort before any write. `claim-hosted-agent-dispatch` is listed defensively only: no entry in this change issues it under the guard. Session, meter, checkpoint, error and cleanup writes pass through, so an owned invocation is never stranded. A malformed `repair:` entry stops all new admissions: this deliberately starves new repair, and cleanup continues.
- **Selection.** The entry uses the worker's own first-due predicate and skips held work, so held work never starves unheld work. An explicit held work id returns before quota or login. One bounded early race is accepted and documented: the entry reads first and passes an explicit work id, so a budget-wait committed between the two reads cannot stop that claim.
- **Genuine rejection.** A failed attempt with no active attempt stays held. The probe fence and the ordinary campaign holds stay open until a separately funded, reviewed disposition. There is no release on a decision, and no fake completion.

## Hosted scheduling is NOT held

- `cd tick` calls `scheduleHosted` with the raw store, and `scheduleHosted`'s own pause check matches scopes exactly, so it ignores `repair:`. With `agents.hosted` configured, **held work is still hosted-dispatched.**
- Do **not** wrap `scheduleHosted` in `guardStore`: its typed `RepairHeld` abort ends the whole scheduling loop and starves later unheld work.
- The unchanged `morpheus cd worker` and `cd tick` entry points ignore the hold. A consumer binding must route the LOCAL worker through the worker-only entry, **and** keep hosted scheduling off while any `repair:` hold exists (no `agents.hosted`, or no hosted scheduling on tick) until a separately reviewed held-aware hosted scheduler exists.

## Limits
Quota thresholds (79.9 admits, 80 refuses, 89.9 continues, 90 or unknown stops), model ownership and discovery are unchanged inside the injected worker. Binding a real ledger store and the pinned runtime's `runWorker` is a separate consumer step. `runHeldAwareWorker` returns `HeldAwareResult`, which is `unknown` (it includes the injected worker's own result): callers must validate and narrow it themselves; it is not a discriminated union. The full import closure of a pinned worker and its operational adoption are not proven by these unit tests.
