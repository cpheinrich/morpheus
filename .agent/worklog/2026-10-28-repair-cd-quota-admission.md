---
id: MO-26-10-28-12.13.24
title: Diagnose and recover CD quota admission failures
date: 2026-10-28
tags: [engineering, devops]
---

# Admission diagnosis and recovery

## Mandate and observed incident

Chris requested fresh heartbeat state, supported read/write recovery authority
and an audit after two days without an accepted Evo TestFlight receipt. Root
replaced cached-only supervision with bounded live native/provider acquisition.
The existing USD350 spend-as-needed/no-internal-holds mandate remains; recorded
spend and unknown liabilities are preserved. Root is the public/PM/operations
writer. Code remains subject to independent review, meaningful CI and protected
non-admin merge, followed by separate qualified runtime adoption.

At actual acquisition2026-10-28T19:11:37.759Z, production17/run40607407673/1
had no receipt and its same repair3 had zero invocations. The intent reported
`Codex account quota read timed out (phase=initialize elapsedMs=60004)`.
Initialization precedes the rate-limit request, so exhaustion is unproven.
Staging35's same repair2 invocation270 exited2 without a session; its exact local
49-byte startup diagnostic was `Evo CD worker: pinned native CLI could not start`.
Its prior explicit incomplete-review continuation gate remains ungranted.

## Design

Extend the existing quota supervisor and worker admission owner. Keep all
unknown/failure outcomes closed to model launch, with distinct fixed categories
for telemetry acquisition, measured capacity and authentication. Preserve the
unreaped private group leader through final signals and complete descendant
cleanup. Report only bounded structured startup/exit categories, never raw
provider stderr, config values or credentials. Existing Node/Python primitives
cover this domain protocol boundary; no generic module or package is proposed.

One source author works locally on the quota reader, admission classification,
focused tests and relevant docs. Root independently investigates the actual
consumer shim and owns task records/review/CI/merge/adoption. A core source fix
must not be claimed to solve an unproven shim failure or deliver a build.

## Evidence and validation

Parent graph Tier2 generation2026-10-28T04:49:32Z; targeted source coverage is
metadata-match/no recorded gap. The flagged test ranges (quota-reader line12,
native-worker line16) were read directly. Installed Q8ba historical source was
the authority for the runtime audit. No exhaustive graph claim.

The separate heartbeat reader passed nine provider-free contract checks,
including a newly observed pending/checkpoint flap that must not renew progress.
An earlier nested-source-pin integration refusal remains preserved as UNKNOWN;
the pin and its contract test were corrected. No failed acquisition was replayed
or relabeled successful.

Source implementation and its validation are in progress. No live worker change,
quota/account probe, upload retry, grant or new delivery is claimed here.

## Final source and test plan

The supervisor has a private status pipe closed in the configured reader and
alone forwards fixed numeric spawn/exit diagnostics over FD3. The TypeScript
reader accepts bounded newline control frames and retains the final cleanup
requirement. Admission and metering now distinguish telemetry/authentication
failure from measured threshold refusal. Existing guarded journal kinds remain;
failure-class event IDs avoid replaying another category in the same time bucket.
Known-safe existing quota diagnostics remain visible, while raw file/JSON/provider
exceptions stay generic.

Commands actually run by the source author on the final affected scopes:

- `pnpm exec vitest run tests/cd/quota-reader.test.ts`: 37passed, zero skips.
- `pnpm exec vitest run tests/cd/native-worker.test.ts tests/cd/worker.test.ts tests/cd/repair-control.test.ts`: 92passed, zero skips.
- `pnpm typecheck`: passed after the final typed diagnostic refinement.
- `git diff --check`: passed.

Root ran `pnpm compile` successfully and inspected the source/doc changes and
generated output. CI owns the full suite; no unchanged local full suite was run.
Actual provider-free process fixtures exercise missing executable, early exit
with foreground descendants, supervisor death, configured-reader FD3 exclusion,
unrelated groups, large stderr and slow initialization. Parser fixtures exercise
fragmented/coalesced, invalid/oversized/extra-field/boolean and duplicate frames.

Preserve earlier failures: the new spawn-status regression failed against the
unchanged source; the first integrated run had123PASS/1FAIL because the fixture
asserted before its microtask, corrected without weakening the assertion. Later
integrated selection passed127; the final typed safe-diagnostic regression made
the final split scopes129PASS. Source author performed no mutation experiments
beyond the unchanged-source regression and claims no mutation score.

Exact-checkout graph bootstrap/check could not establish an index for this new
worktree. The parent graph's metadata and direct task-source reads were used;
a later MCP coverage call closed its transport. Neither condition blocks source
verification or proves whole-code completeness. Direct source confirmed that
repair-control guards the preserved `agent-budget-wait` journal kind.

## Further live evidence, not source acceptance

A separate one-shot no-account version/config-read policy diagnostic passed both
handshakes on the existing pinned native CLI. That current observation does not
explain the prior shim refusal. Production17's own provider-digest-authenticated
native evidence has1256unique expected/actual tests,1255PASS/1FAIL/0SKIP;
its post-shutter camera-tail UI assertion measured1.563681960105896 against a1.8s
minimum. Verification failed with3errors. No complete timing root cause, uploaded
build, worker adoption or delivery is inferred. Native repair3 remains unchanged.
