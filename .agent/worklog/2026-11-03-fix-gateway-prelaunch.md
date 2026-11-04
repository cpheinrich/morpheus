---
date: 2026-11-03
agent: codex
roadmap: MO-26-11-03-17.34.41
tags: [engineering, devops, infrastructure]
---

# Factory prelaunch admission recovery

## Original intake

The supervising root supplied a bounded follow-up to merged PR604. This worker files,
claims and records the task only, then stops for root to launch a fresh implementation
worker in the exact isolated workspace. Do not edit the earlier PR604 worktree, the Evo
PR769 author's checkout or root's private handoffs. No implementation clearance or source
review is claimed by this intake record.

## Mandate

Correct the shared Factory lifecycle so a caught failure demonstrably before any
guardian/provider spawn is durably terminal as never launched. Preserve the existing
uncertain-launch and unverified-cleanup holds. This repairs the reusable owner rather
than asking a consumer to discard an unknown effect. Reuse the existing API, admission
identity, result records, process guardian and dependencies; no new retry option, quota
gate, ledger, provider or native fallback.

Chris's November 3 CD-remediation authority covers the normal claimed-worktree repair,
focused tests, fresh independent review, required CI and protected merge, with additional
review rounds recorded under the contract. Existing Factory gateway usage is authorized;
no new paid services or direct-vendor spending is granted. The current Codex subscription
stays controller-only. This intake performs no provider probe or service operation.

## Supplied reproduction, read but not rerun here

Root retained a private synthetic CLI proof against merged Morpheus main
`9aa514d7bc925166df87320b9ba1add0272aafea`. The intake worker read that JSON proof directly;
its private host paths and runtime records are not copied into this public worklog.

1. Use an isolated job/workspace, a caller admission UUID, `keyRef` set to
   `env:FACTORY_PREFLIGHT_PROBE` with that variable initially absent, and a loopback gateway
   on port 1. Root reports no provider/external calls in this reproduction.
2. The runner reserves the admission before credential resolution. The CLI returns
   `outcome: failed`, summary `Gateway credential resolution failed; no fallback`.
3. Status returns the admitted wrapper, `sessionId: null`, `terminationVerified: false`,
   `state: needs_input` and `Worker termination is unverified; workspace admission remains held.`
4. Restoring the resolver and repeating that same UUID returns the same held unknown state,
   not a recoverable terminal never-launched failure. The consumer's refusal to launch a
   replacement is correct given that report; temporary setup has stranded recovery.

The synthetic admission identity is available in root's retained proof. No live admission
is deleted, repaired, resumed or repeated by this task intake. The historical PR604 review,
including fixed finding FGW001, remains untouched and is not reused as this fix's review.

## Smallest implementation contract for the next worker

At a known caught failure before any guardian/provider spawn, persist a terminal failure
and explicit never-launched evidence through the existing owner. Return an admitted result
whose status and replay describe that same retained failure. Do not let status reconstruct
this case as a missing-guardian unknown. A failed UUID is never repurposed to run work:
same-ID replay always returns its original evidence, including after credentials recover.

The consumer starts a fresh intended invocation with a fresh durable UUID after correcting
the setup cause. No `--resume` is appropriate when there was no native session. A later
invocation with a real native session keeps normal exact-binding continuation semantics.

Distinguish proof of never starting from unverified termination. An error after a possible
spawn, a process-census gap, a crashed guardian or missing/corrupt retained evidence must
keep the existing hold. Missing Python or another known spawn error may be covered only
where the OS launch result proves no guardian/provider exists; do not infer safety from
an error message or an absent PID and do not blanket-set `terminationVerified`.

Keep provider arguments, exact sandbox/approval policy, one-writer scope, descendant cleanup,
gateway binding and secret-safe diagnostics. Add no native telemetry or billing fallback.
Add only the minimal architecture/decision documentation needed for the unattended API
and corrected lifecycle, retaining the README's public usage contract.

## Acceptance and later review evidence

- Actual CLI/fake-provider tests retain a launch counter and exercise missing credential,
  status, same-ID replay, resolver restoration, same-ID replay again, then a fresh-ID launch.
  Assert exact outcomes/session/verified-never-launched evidence and zero/one launches.
- Cover other proven prelaunch preparation failures and any supported definitive spawn
  refusal without weakening ambiguous launch or unknown existing-worker admission.
- Keep normal resume, binding refusal, one writer, descendant cleanup and secret redaction
  regressions. Check that resolver errors never expose secret values or raw child environment.
- Source implementation follows focused-first testing and normal typecheck/compile/PM index,
  fresh independent review, CI and protected merge. Retain failed attempts and findings.
- Authenticated gateway smoke and installed runtime adoption remain separate acceptance;
  synthetic provider-free tests do not prove them. Root owns consumer/runtime coordination.

## Intake evidence

Primary main is `9aa514d7bc925166df87320b9ba1add0272aafea`. The four required records are
unchanged from the fully read prior baseline; a Git comparison confirmed no record delta.
Primary and new worktree context refresh both explicitly credited all four. The task
checkout's record bytes also matched the primary. The normal PM CLI filed the tagged
item and created one new isolated worktree; its repeated claim committed/pushed the new
branch and reconciled the merged PR604 item to shipped as normal bookkeeping.

Only the new roadmap body and this worklog were authored in this intake. No implementation,
PR, provider invocation, service change, Evo edit, old-claim edit or private proof mutation
was performed. The unrelated untracked funding item in primary remains preserved.

## Implementation — 2026-11-03

The fresh implementation author continued this exact claimed checkout under native Codex
session `01a1a434-b551-75f0-add4-e21ffd9467da`. It read the original synthetic proof without
changing or repeating it. No Evo workspace, old claim, private handoff, service or live
provider was changed. The supervising root owns fresh independent review and subsequent
CI/merge/runtime qualification; this author stops after an unlabelled draft and full packet.

The admission record now retains `prelaunchFailure` with phase, `never-launched` proof and
a fixed sanitized summary when preparation throws before any guardian spawn. A definitive
OS `spawn python3` ENOENT, with neither a spawn event nor child PID, receives the same
treatment with phase `guardian-spawn`. No other spawn error is certified. Status builds a
terminal failure from this proof only with a null native session and no process record;
it does not trust a stale result file as proof. The returned exit code is null because no
worker exited. CLI status exits 1 for a failed result, consistent with invocation failure.

Same-ID replay remains exclusively reserved and returns the retained failure after setup
recovers. A consumer must persist a fresh UUID and omit resume when there was no native
session. Invalid continuation preparation likewise retains a no-launch failure; existing
successful continuation and exact binding remain covered. Missing proof, contradictory
starting evidence, missing/corrupt old admissions, dead guardians and unreadable descendant
census retain the existing unknown holds. No old operation is erased or retroactively cleared.

The README documents phase/proof and service recovery; architecture §18.0 and decisions
now name the unattended entrypoint and boundary. Reused existing atomic admission/result
helpers and native spawn evidence; no generic module or dependency was introduced, so no
new package selection was needed. There are no new options, quotas or provider fallbacks.

## Validation

- `node --test plugins/factory/tests/unattended-worker.test.mjs`: 19 passed during iteration.
- Final pinned-plugin dependency run: `node --test plugins/factory/tests/unattended-worker.test.mjs plugins/factory/tests/gateway-workers.test.mjs plugins/factory/tests/guardian.test.mjs plugins/factory/tests/processes.test.mjs plugins/factory/tests/reverse.test.mjs`: 49 passed, 0 failed, 0 skipped. Scope covers changed admission/CLI behavior plus directly coupled routing, native resume, permissions, redaction, one writer and descendant cleanup.
- `pnpm check` in `plugins/factory`: passed (JavaScript syntax and Python AST checks).
- `pnpm typecheck`: passed. `pnpm compile`: passed, no generated changes.
- `pnpm morpheus pm index`: unchanged indexes. `git diff --check`: passed.
- No full root suite: shared core was untouched; CI remains responsible for full integration.

The CLI test uses an isolated Factory home and fake provider launch counter: absent key,
status, replay, restored-key replay all yield the identical failed record and zero launches;
a fresh UUID completes once with no resume argument. Other fixtures cover sessions-directory
preparation failure, actual missing Python spawn refusal, missing/contradictory proof,
service death, killed guardian and detached owned descendants. These do not establish an
authenticated gateway smoke or installed runtime adoption.

## Attempts and tooling limitations

The first test command could not load Zod before dependencies were installed. Root install
alone is not the plugin install; the final focused run used the plugin's documented
`pnpm install --ignore-workspace --frozen-lockfile`. An owner-lease interruption lost the
in-flight coupled test/syntax sessions' completion receipts; no success was inferred.
Only that unverified batch was rerun with retained output, producing the 49-test result.
Previously completed typecheck, compile and index checks were not repeated.

Initially no graph tools were callable, and the prescribed check/install could not verify
the checkout index. Current exact source was read instead. After resumption graph access
was available: Tier 2, exact task project generation `2026-11-04T01:45:27Z`, matching coverage
metadata for the module, CLI, test, Codex helper, store, guardian and ownership source.
Symbol search, both-direction depth-one trace and result snippet corroborated the current
owner/CLI/test path. No recorded gap is only a best-effort signal; a heuristic `events` edge
to an unrelated iOS test was disregarded in favor of exact imports/source.

All four context records were read. Their reads through the orchestration tool were not
credited, so the documented assertion fallback issued the receipt explicitly; no hook-
credited certification is claimed for this implementation session.

## Review handoff

Independent review has not started and no clearance is claimed. Keep the PR draft,
unlabelled and auto-merge disabled until the supervising root runs a fresh reviewer with
the complete prepared packet, records findings/timing, and completes required CI. No open
implementation question remains; live adoption and authenticated qualification are separate.

## Pre-review consumer integration — durable invocation timing

Before the first independent review, root added one requirement within this lifecycle
task: an unattended reviewer must retain actual runner duration if its consumer loses the
reply before saving the review record. This update changes only Factory source/tests/docs
and these records; no reviewer was launched and no review clearance exists.

The existing guardian now retains UTC `startedAt` and `endedAt` plus monotonic integer
`durationMs` in its process evidence for an admitted provider invocation. Measurement starts
immediately before provider spawn and ends after owned cleanup, covering tool/provider waits.
It uses a separate clock sample and leaves the existing deadline, lease, stop and cleanup
logic unchanged. The public result exposes optional `timing` with runner-source provenance
and an admission/process-record attestation only for verified terminal results with a native
session and complete, positive safe-integer timing. Never-launched, rejected, unknown,
legacy/unmeasured and null-session cases invent no reviewer duration. Consumers compute
`elapsedMinutes = durationMs / 60000`; UTC timestamps are provenance, not elapsed measurement.
Status reconstructs the same timing from guardian evidence even without the derived result
file, and same-ID replay remains idempotent with no additional launch.

Final focused command (same five files listed above): 51 passed, 0 failed, 0 skipped. The
lost-reply test discards actual CLI stdout, deletes `result.json`, and recovers exact process
timing through status/replay. It asserts at least 700 ms for the bounded 300 ms provider
pause plus 400 ms detached-tool cleanup, and checks UTC bounds against caller/cleanup
observations. Boundary tests reject zero, negative and fractional duration, incomplete or
invalid UTC metadata, unknown termination and absent native session. Existing prelaunch,
deadline, lease, ownership, native resume and redaction regressions still pass.

Factory `pnpm check`, root `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and
`git diff --check` were rerun for this source increment and passed; no generated changes.
No full root suite was run. Final focused receipt is retained privately as the timing
batch log. Graph tools were not callable on this continuation, so current guardian/module/
test source was read directly; the previous generation is not claimed as current coverage.
The README, architecture, decision entry and roadmap acceptance now document timing.
No new dependency, timing daemon, lease, option, live provider probe, consumer edit or
installation was added. PR605 stays draft/unlabelled with auto-merge off for root's fresh
independent review of the complete final increment.
