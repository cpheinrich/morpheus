# Paperclip pilot

This first integration adopts Paperclip's existing queue, run lifecycle, sessions, parser and dashboard. It does not create another task scheduler. Operational state and credentials stay in a private per-user runtime directory, not this repository.

## Boundary and first increment

Pin the released `paperclipai@2026.1012.0`. Run one isolated loopback-only controller. Register separate agents with immutable host identities and dedicated workspaces on the MacBook Pro and Zoe's Mac mini. Use `codex_local`, CLI engine, an explicit model/effort, no automatic timer work, one concurrent run per agent and a bounded daily allowance.

The upstream SSH environment copies controller authentication to the remote host. The pilot instead uses a narrow command wrapper: relay the adapter's arguments, prompt and run-scoped Paperclip variables over verified SSH; invoke the remote host's existing logged-in Codex. Do not forward CODEX_HOME, provider API keys or provider/session files. Each host retains its own auth and conversations. The wrapper must preserve Codex JSONL on stdout and bind its inventory to host + agent + workspace. Changing that binding requires retiring the agent and enrolling a new identity.

A private reverse SSH tunnel connects the remote worker to the loopback controller. Treat that tunnel as access to the local-trusted board, not a restricted bearer-only endpoint: it is limited to the two authorized user accounts/hosts, never exposed on a wildcard listener, and documented as a pilot trust boundary. Do not extend it to untrusted machines. Hard deadlines and owned remote process groups bound work even if the SSH client vanishes; uncertain termination prevents resource reuse. Kernel-backed host slot reservations cover independent agents. Capacity probes do not consume model tokens.

The first workspace supports bounded research, decision and artifact tasks. Arbitrary consumer coding workspace synchronization, full cross-account mid-task migration and dynamic model optimization are capabilities to qualify later, not claims implied by two successful probes. The enrollment script detects prerequisites, registers capabilities, is resumable, and distinguishes metadata readiness from a real accepted task round trip.

## Acceptance and historical evidence

Live acceptance: a centrally read-back nonce artifact on each host, a cheap competing-worker slot drill, remote cancellation with termination proof, and controller restart followed by a new task without duplicate ownership. Capture run IDs and outputs; a health endpoint or zero exit alone does not pass.

Historical cases are sanitized reconstructions, not exact user prompts. Keep inputs, retrievable evidence and separate oracles immutable with hashes. Freeze the baseline/candidate prompts and model/effort before evaluation, mark development versus execution-holdout cases, retain failures, and never leak oracle text into worker input. Source lessons about paired benchmark manifests, evidence-based completion, host-local sessions, unknown quota and resource contention shape the policy. Include cases orchestration cannot repair, such as broken signing semantics and application freshness deadlocks.

Compare bounded next-action/routing/evidence decisions, not full historical implementations. A small model may already pass the baseline; retain that ceiling result. Report observed pass/fail and policy mechanism coverage without estimating saved iterations or productivity. Prospective work is needed for those claims.

## What to measure next

The pilot passes its execution gate when both hosts deliver exact artifacts, account/host/run
attribution and fresh-session evidence are retained, every accepted run settles, contention refuses
excess work, and interruption drills prove termination before reuse. A safe interrupted task is
not a successful task; seamless hot restart is a separate qualification.

Historical decision accuracy is a cheap regression screen. Require zero harmful candidate
decisions and no paired regressions; a tie is no evidence of improvement. Lessons and oracles
come from the same incidents, so even a perfect score cannot establish generalization.

After this bounded pilot, qualify an authenticated controller and repository workspace/delivery
interface before real project dispatch. Then compare the next ten suitable incoming tasks using
predeclared acceptance checks and ordinary independent review, without replaying old implementation
work. Record human interventions, time to accepted result, abandoned/stale tasks, repeated failed
attempts, quota deltas, requested model/effort, unknown serving-model attribution, host/slot wait,
and cleanup failures. Success means no abandoned accepted assignments or unsafe resource reuse,
at least eight of ten tasks accepted with at most one human clarification each, and a measured
reduction in human coordination compared with their ordinary workflow. These are initial targets,
not a claim that this pilot has achieved them. Model routing can then be tuned on acceptance per
allowance consumed, with explicit escalation after verifier failure; do not infer a cheap model's
suitability merely from a department label.

## Delivery

No consumer auto-migration. Morpheus remains the repository delivery authority. The pilot stores explicit acceptance and verified completion evidence with Paperclip tasks; claims, independent reviews and protected-branch CI remain unchanged. Install no paid fallback and admit no work when provider allowance is unknown. Keep reversible stop/remove instructions and a capability matrix with unqualified items visible.

## Design review response

How the implementation in `scripts/paperclip-pilot/` answers each review requirement, and what stays open.

- **Quota on every launch, both hosts.** `supervisor.py` runs `quota.mjs`, which imports the existing `nativeQuota` from `dist/cd/quota-reader.js`; no provider protocol is duplicated. Output is a sanitized `{observedAt, source, windows}`. Admission requires a fresh dated read, a configured limit for every reported window and a future reset; unknown, stale or failed telemetry refuses. Window ids carry no duration — both native accounts report only `primary`, which is weekly — so private host configs set the conservative weekly limits on every id.
- **Margin, not zero overshoot.** Admit while `used + other in-flight × reservePp < stopAt`; a running meter stops at `hardAt` or on an unknown read; runs are bounded by `maxRunSec`. Delayed telemetry can still overshoot, which is why `stopAt` keeps a 5-point margin below `hardAt`.
- **Atomic reservations across workers sharing an account.** A controller-side flock per inventory `accountId` serializes admission; held reservations are released only on a verified or not-started receipt. Distinct ids are independent, so hosts sharing a real account must share the id. No distributed scheduler.
- **Persisted identity and reconciliation.** The receipt (run UUID, host, agent, account, supervisor pid and start time) is written before launch with termination `pending`, then the model pid and start time. A fresh supervisor never assumes a detached child is gone: it reconciles a previous run by ownership-marker census, terminates exact identities and reuses the slot only after a census finds none; otherwise the slot is quarantined.
- **Review corrections.** Quota admission and metering now share the model's UID-derived native environment, excluding inherited account overrides and run tokens. Enrollment pins all eight host/route/account/workspace identity fields; the wrapper checks the registered fingerprint before reserving and the supervisor checks it against the staged configuration before reading quota. Missing fingerprints require explicit retirement and new registration. A stage-only change or partial inventory rollback refuses rather than moving an existing session.
- **Fixture tests.** Sleeping fakes cover byte-exact JSONL pass-through, stdin loss, SIGTERM, deadline, meter breach, supervisor SIGKILL with a live orphan (slot stays held, descendants reconciled), unknown termination (quarantine until a census proves it), wrapper SIGKILL (reservation reconciled), the SSH command and tunnel rewrite, enrollment idempotency and drift refusal.
- **Immutable binding outside the workspace.** Host config and inventory must be owner-only and outside the workspace; the envelope's host and agent must match; model, effort, sandbox and stdin prompt are enforced; workspace, home, profile, provider and bypass overrides are refused. The staged `AGENTS.md` digest is in the host config, so a model that rewrites its instructions blocks the next run.
- **Trust boundary.** The per-run reverse tunnel is loopback on both ends with `ExitOnForwardFailure`, and it grants the local-trusted board. The pilot is restricted to the two authorized hosts and dedicated artifact/evaluation tasks; the operator reads artifacts and receipts back; a model's done comment is not acceptance. No new security proxy. Qualification for real project dispatch: an authenticated Paperclip deployment on a private network, per-agent scoped credentials verified to reach only their own tasks, and a reviewed workspace-sync design.
- **Historical evaluation.** Identical case evidence for both conditions, one fresh session per case and condition (resumed runs score `unknown`), rubric and oracles frozen with digests before results, no oracle input, development versus execution-holdout split, and the neutral workspace instructions frozen with the prompts.
- **Observed during live operation (parent).** Wakeup idempotency keys produced duplicate synthetic runs, so manual wakeups are never blindly retried. A hot controller restart left an in-flight run shown as running without adoption; operators run `status`/`reconcile` and cancel explicitly. The served model is not reported by `codex exec --json`; receipts record the requested model and effort and an explicit `unknown` observation. The installed permissions endpoint requires `canCreateAgents` and `canAssignTasks` together; enrollment sends both with `canCreateSkills`, all false.
