---
date: 2026-11-03
agent: codex
roadmap: MO-26-11-03-16.49.28
tags: [engineering, devops, infrastructure]
---

# Unattended Factory gateway worker — intake and design hold

The supervising Codex accepted the read-only design/history audit and authorized source
intake and claim for the reusable Factory-owned entry point. Implementation and PR work
wait for its independent design critic and explicit root clearance. This record is a
working mandate, not a cleared design or an implementation result. Other agents own the
consumer and private handoffs; their work must not be reverted or changed here.

## Mandate and boundaries

Provide one supported unattended gateway worker command without inventing desktop task
metadata or weakening existing desktop permission admission. Use the existing gateway's
credential reference, explicit provider/model/effort and exact permission settings. The
operator's current Codex subscription remains controller-only. Native account access,
native fallback, paid-vendor fallback and new paid services are prohibited.

Source ownership is `plugins/factory/` code/tests/docs plus the normal task records and,
when authorized implementation establishes a changed contract, its architecture/decision
documentation. Consumer source, its services, active delivery runs and its separate
one-time production observer are outside this worker's ownership. No Paperclip issue or
pool enrollment is implied by the local gateway contract.

## Historical findings informing this design

- Earlier recovery could finish tests or merge a repair without completing delivery.
  Keep worker completion separate from consumer receipt-confirmed acceptance.
- Native quota-reader startup errors once looked like exhausted capacity and left repair
  idle. Do not reintroduce native-account telemetry or a quota admission controller here;
  gateway errors are retained execution evidence, with no route or billing fallback.
- A repair stalled behind an incomplete review and an unavailable original reviewer.
  Preserve findings while permitting a fresh independent review under current policy;
  this engagement authorizes additional rounds, which are recorded when used.
- A later steward had reviewed source but no installed runtime. Source tests and merge
  cannot establish host activation or successful unattended invocation.
- Fresh sessions with prose-only handoffs can abandon an unfinished incident. Factory
  preserves bounded worker sessions/checkpoints; the consumer retains the incident owner.
- A queued replacement delivery previously made health read as healthy. Consumer policy
  must adopt active work without clearing the incident or dispatching a duplicate.

These lessons come from the bounded prior audit, current Factory source and repository
decisions; they are not new live-delivery or installation claims. Private incident
identifiers, host details and service credentials stay outside this public task record.

## Simplest proposed implementation after clearance

1. Add `plugins/factory/scripts/gateway-worker.mjs` as the direct public CLI entry and a
   small `plugins/factory/src/gateway-worker.mjs` owner. Keep it separate from desktop
   `Manager.start`/`codexStart` admission. Read a private explicit service configuration
   and prompt stdin; produce one structured result with durable checkpoint references.
2. Validate job identity, canonical working directory, selected configured gateway,
   provider/model/effort, exact permissions and run bounds using existing Zod/native
   facilities. Reuse `checkCodex`/`checkClaude`, `codexArgs`/`claudeArgs`, key-reference and
   environment helpers; never invoke their native-authentication branches. Pin session
   provenance to the job, checkout and gateway. Do not add a provider-selection policy.
3. Reuse the existing guardian and process ownership facilities for bounded execution,
   descendant cleanup, output limits and a single writer. Persist invocation identity
   before launch and preserve unknown outcomes; reconcile instead of blindly relaunching.
   Expose only the runner operations the consumer actually needs. Exact lifecycle wiring
   and any helper extraction remain subject to the critic's findings and source review.
4. Add focused tests under `plugins/factory/tests/` for gateway-only launch, exact
   permissions, secret-safe diagnostics, continuation provenance, concurrent writers,
   timeout/descendants, restart and unknown outcomes. Run relevant existing gateway,
   process and desktop-admission regression tests. Update Factory README/help and changed
   architecture/decision text without introducing a dependency unless a concrete need
   survives the build-versus-borrow check.
5. Publish through normal focused checks, typecheck, compile, PM indexing, fresh independent
   review and CI/protected merge after authorization to implement. Qualify authenticated
   gateway smoke and installed runtime separately; consumer rollout belongs to its owner.

## Consumer requirements kept outside this implementation

Same-commit recovery should use GitHub's failed-and-dependent-jobs rerun endpoint so
successful ancestors remain, source/ref stays fixed and the reusable workflow retains
its original SHA. The supervising root owns a harmless controlled canary proving that
behavior; no canary was run here. Do not build a custom cache, filter physical tests or
infer delivery from a green simulator job. Only a matching internal-availability receipt
can close delivery; uncertain or accepted uploads require reconciliation before replay.

## Intake evidence

Read all four required primary records in outputs below 8 KB; context refresh explicitly
reported read coverage for all four. The prepared task checkout's record bytes matched
the primary's, and its own refresh also reported coverage. Created this item with the
normal PM CLI and requested tags, prepared one task worktree, then repeated the claim
there with session association. PM pushed the claim branch and marked the task in progress;
it also reconciled an already-merged scheduler item to shipped as normal claim bookkeeping.

No implementation, PR, gateway invocation, workflow dispatch, provider call, service
change or consumer edit has been performed in this intake turn. No tests have been run;
this turn creates task records only. The design critic's clearance remains pending.


## Implementation after supervising-root design clearance

The resumed mandate cleared source implementation under the accepted independent design
conditions. Added a Codex-only explicit gateway command/module, reusing argument,
permission, handoff, environment, credential-reference, event/result and atomic-store
helpers. This is the smallest provider surface needed by the authorized engagement;
Claude configuration explicitly refuses. No desktop identity, native authentication,
quota controller, Paperclip setup, service installation or consumer edits were added.

The existing guardian gains opt-in unattended admission: a kernel-held per-canonical-
checkout lock and a durable exact-run pointer precede provider spawn. Missing/corrupt or
unknown termination holds admission; it never clears on PID death or age. Verified group
cleanup is required for readmission. Bounded invocation evidence supports status recovery
and same-binding continuation after actual service-owner death. The CLI process owns its
lease; no desktop conversation is involved. Killing the guardian itself remains an
explicit operator reconciliation case, rather than assuming an orphan is safe.

Credential values reach only the child environment; the runner pins the gateway API-key
source and disables native OpenAI auth in an isolated per-binding Codex home. The guardian
redacts known keys in both output streams before disk writes, including split reads.
Private host configuration, prompts and state are never committed. Process ownership
is not a security boundary against the authorized OS user. All unattended callers share
one Factory home; separate desktop and other author processes must not use the service's
claimed checkout. No new global desktop admission machinery was added.

Build versus borrow: registry inspection of proper-lockfile 4.1.2 found last modification
2022-06-24 and three dependencies (graceful-fs, retry, signal-exit). Reused the guardian
and Python standard-library flock instead: kernel lock lifetime plus the existing run
record directly serves this provider/process contract, with no stale-lock timeout or
new generic dependency. Existing Zod and native Node APIs handle the small CLI/config.

Initial new tests: 10/11 passed; the permission fixture used creation mode 0644 under a
restrictive host umask, so it was actually private. Fixed with explicit chmod. The next
focused batch passed all executed lifecycle tests but three existing test files could
not load ws: pnpm's initial directory install selected the root workspace. Installed
standalone plugin dependencies with --ignore-workspace --frozen-lockfile --offline and
reran the affected batch. These were fixture/dependency setup failures, not gateway
availability or native-account evidence.

Code discovery used current exact source after MCP graph tools were unavailable and
both codebase-memory install --check/install reported no exact-checkout index. Read
current task/design handoff, AGENTS, inbox, relevant decisions/learned sections, Factory
architecture and test-quality/PM runbooks. The context hook did not credit demonstrated
small reads through this tool route; no full-record read-coverage assertion was made.
The existing claimed worktree/branch was preserved throughout.

## Validation and source handoff

Final focused batch: 67/67 passed, including 12 new unattended lifecycle tests. Commands:

```sh
pnpm --dir plugins/factory install --offline --ignore-workspace --ignore-scripts --frozen-lockfile
node --test plugins/factory/tests/unattended-worker.test.mjs plugins/factory/tests/guardian.test.mjs plugins/factory/tests/processes.test.mjs plugins/factory/tests/gateway-workers.test.mjs plugins/factory/tests/config.test.mjs plugins/factory/tests/manager.test.mjs plugins/factory/tests/reverse.test.mjs
pnpm typecheck
pnpm compile
pnpm --dir plugins/factory check
pnpm morpheus pm index
git diff --check
codex exec resume --help
```

This scope exercises the modified guardian and direct runner/provider/config/desktop
admission dependents. Full repository Vitest suite was not run: no shared core changed.
Compile/index generated no changes. The native CLI help confirms the inherited resume
argument surface without authenticating or launching a model. All provider execution
fixtures are fake binaries launched through the actual CLI/guardian process path.

Source publication is a draft awaiting the supervising root's fresh independent review.
Authenticated gateway smoke, native CLI end-to-end behavior against the configured
provider, installed-runtime/service startup parity, and actual consumer recovery receipts
remain unverified and outside this implementation turn. No daemon, runtime/config install,
Paperclip mutation, gateway API request, consumer edit or release was performed. A killed
guardian intentionally requires operator reconciliation; the retained held-admission
case is tested. No human clarification or policy waiver is requested by this source PR.
