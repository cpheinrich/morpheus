# Interactive remote delegation through the existing bridge

Native blocked transitions require an unblock route. The runner supplies a board-owned
`unblockDescriptor` pointing to the controlling Codex conversation, and clears it on done.
This follows the pinned API's actual HTTP 422 guard; a question in a comment alone is insufficient.

Status: staged on both hosts. Remote Codex and local Claude have completed real nonce turns;
final protocol and recovery qualification is in progress. Task MO-26-10-24-00.59.32; acceptance is in
qa/acceptance/MO-26-10-24-00.59.32.md. Remote Claude live acceptance is pending native
sign-in on the Mac mini and is not replaced by synthetic evidence.

## Root proposal (retained)

The user stays in their Codex desktop conversation. Extend the optional codex-claude plugin
with pool start/status/wait/logs/answer/follow-up/stop/reattach operations for both providers.
Paperclip owns task admission, run identity and durable history. The existing bridge owns
coordinator-facing supervision, provider event parsing and clarification/permission policy.
Morpheus Git tasks retain intent, review and delivery authority; no competing scheduler.
Compare Paperclip's native Runner first; otherwise use its process adapter to invoke the
bridge runtime on the selected host with native host authentication. Persist coordinator
thread → pool conversation → immutable worker binding → Paperclip issue/run → remote run →
native session. Journal before external task creation; never blindly repost. Follow-ups
resume the same native session at a turn boundary; no false mid-turn steering. Routine
reversible clarifications may be resolved by the coordinator with a reason; permissions,
spend, publishing and expanded authority need the user. No credentials travel.

## Independent critique (Claude, 2026-10-24) and the choice taken

**1. Native Runner: rejected for this boundary, on installed-source evidence.** Pinned
Paperclip 2026.1012.0 vendors `paperclip-runner`. Its ACPX Claude profile runs
`@anthropic-ai/claude-agent-sdk` 0.3.286 under an isolated `CLAUDE_CONFIG_DIR`, accepts only
`ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` credential names, and is qualified for one model
(`claude-sonnet-5`) — a token/API path, not the host's own `claude auth login`. Its Codex
profile pins `@openai/codex` 0.160.0 (mini runs 0.163.0) and stages auth into a private
agent home (`.paperclip-auth-staging-v1`). Runtime-request resolution
(`/heartbeat-runs/:id/runtime-requests/:rid/resolve`) only accepts `runtimeMode: native`
runs. Adopting it would mean credential staging or a new billing path, so it fails the
mandate. Revisit when a Runner profile can execute the host's installed CLI with its
native login and no staged credential.

**2. The process adapter gives no inbound channel; the proposal assumed one.** "Relay live
clarification through the bridge's control-response path" needs a way to deliver an
answer into a running turn. Paperclip's `process` adapter spawns a command with
`PAPERCLIP_AGENT_ID/COMPANY_ID/API_URL/RUN_ID/API_KEY` (no task id, no stdin), captures
stdout/stderr into an NDJSON run log, and kills the child on cancel/timeout. Issue
interactions and runtime requests are not routed to a process child. Choice: the
Paperclip-spawned **pool runner** runs on the controller host, which in this deployment is
also the coordinator host (controller is loopback `127.0.0.1:3100`). Answers and stop
requests reach it through an owner-only control spool in the bridge home; the runner
forwards them over its SSH stdin. **Co-location of controller and coordinator bridge is a
stated v1 requirement**, not a hidden one. A remote coordinator would need a Paperclip-side
channel and is out of scope.

**3. One Paperclip run per provider turn, not a long-lived run per conversation.** A
conversation is one Paperclip issue; turn 1 is the issue (assignment wakes the agent) and
each follow-up is an issue comment (`issue_commented` wakes it; `reopen: true`). A
long-lived run would hold a slot and lease across human think time and make loss recovery
ambiguous. Turn-boundary follow-ups are therefore native; mid-turn steering is not claimed.
Live clarification exists only where the provider supports it (Claude stream-json
`control_request`); Codex `exec` reports `needs_input` at turn end.

**4. Duplicate defense must not depend on Paperclip idempotency.** The pilot observed
duplicate runs from wakeups, and stranded-issue recovery can re-wake an agent. Each turn's
intent is journaled locally before any POST; the runner must atomically claim
(`mkdir turns/<n>.claim`) the single pending turn before any host contact. A second run for
the same turn, a stray wake or a recovery wake finds no unclaimed turn and exits without a
provider call. Issue creation still uses `idempotencyKey` and comments `clientRequestId`
(both deterministic per conversation/turn), but correctness rests on the claim. An unknown
POST outcome is never reposted automatically; `pool.reattach` observes the issue/comment
marker, and an explicit `retry` reposts with the same keys — the claim keeps provider calls
at most one per turn.

**5. The remote never receives a Paperclip credential.** The pilot forwarded `PAPERCLIP_*`
through a reverse tunnel so Codex could call the board. Pool workers do not need the board:
the runner keeps `PAPERCLIP_API_KEY` in its own process, builds the SSH client environment
from an allowlist, and sends the remote only the selected prompt, the binding digest, the
native session id and non-secret ids. No `-R` tunnel exists, which removes the pilot's
"local-trusted board reachable from the remote account" exposure for this path.

**6. Reuse, not a second harness.** The host side (`pool-remote.mjs`) instantiates the
existing `Manager.launch`/guardian/tick loop with the existing `claudeArgs`/`codexArgs`,
`subscriptionEnv`/`codexEnv`, auth checks and event folding (Claude folding was extracted
into `applyClaudeEvent` so both ends share it). The runner renews the guardian lease; the
desktop bridge never does, so a desktop disconnect cannot end or own a turn. Loss of the
runner or SSH closes the remote's stdin; the remote stops the guardian and records a
receipt. Unknown termination quarantines the workspace lock and the account reservation;
the next admission reconciles over SSH before replacement. No seamless migration is claimed.

**7. Protections carried over from the pilot, not weakened.** Operator-owned profile file on
the controller and host file on the worker (0600, owner, outside the workspace); a host-side
immutable binding (the host's staged profile entry is authoritative for provider,
workspace, model, effort and permission; the envelope may only match it); native auth check
before launch; host-side quota admission from an operator-configured native quota command
(unknown/stale/exhausted refuses; meter stops at the hard limit or on unknown telemetry);
controller account reservations reconciled through the host before release; one writer per
workspace through a host lock with process-identity verification; bounded output, run time
and lease. The pilot `supervisor.py` itself is Codex-exec-specific (it validates
`exec --json … -` argv), so the pool reimplements only its quota judgment rule (~30 lines)
rather than routing Claude through a Codex validator.

## Hardening before live deployment (2026-10-24)

Pool mutations now pass the bridge's existing coordinator invariants instead of only the
global switch. `start`, `followup` and `reattach --retry` require the calling Codex task id
and refuse while draining, when delegation is off globally or for that task or project, when
the task's live settings cannot be read, or when the profile's permission exceeds the task's
sandbox (`readOnly` → `plan`/`read-only` only; `workspaceWrite`/`dangerFullAccess` → any pool
profile; unknown sandbox or approval policy → refused). Another session may continue under its
own authority, but never revives a conversation whose original task or project is off.
`answer` applies the off checks without a live snapshot; observation operations stay ungated so
a restart does not depend on the original session. The delegated-worker guard covers start,
follow-up, answer and retry in both CLI and MCP. A denial happens before any local record or
Paperclip write.

On the host, the config file and every workspace must already be canonical real paths
(`realpath(p) === p`), workspaces may not nest, and the bridge state directory may not overlap a
workspace; the run re-checks the workspace with `lstat`/`realpath` immediately before taking its
writer lock, so an alias or symlink cannot create a second lock for one checkout. Receipts and
status separate requested from observed model/effort and keep provider-reported token counts as
evidence, not quota. Native host permissions and processes that deliberately detach or scrub
their environment keep the limitations already recorded for the guardian and pilot census.

## Paperclip completion protocol (live finding, 2026-10-24)

Live runs showed the first version ignored Paperclip's own completion contract. The pinned
server queues a `missing_issue_comment` retry after a succeeded run that left no comment
attributed to itself (`createdByRunId`), and an `issue_disposition_repair` wake when a succeeded
run leaves its idle issue `todo`/`in_progress` (any other status is a recorded disposition).
Claims kept those wakes from reaching a provider, but they wasted runs and left tasks open.

- **Disposition.** The runner writes with its own run credential and `X-Paperclip-Run-Id`, so
  Paperclip attributes the write to the run. Before marking a turn finished it journals
  `turns/<n>.disposition.json`, then sends one `PATCH /issues/:id {status, comment}`: `done`
  for a completed, verified turn and `blocked` for needs_input, refused, failed, interrupted or
  lost. Paperclip `done` is operational status, never Git acceptance, and the comment says so.
  Paperclip ignores comment request ids from agent actors and a timed-out PATCH can still land,
  so a disposition is sent once. An unknown outcome stays unknown until a later wake, a
  reattach or a follow-up attempt observes that exact run's marker; absence settles nothing
  and nothing re-sends it. A 4xx is a definitive rejection.
- **No-op wakes.** A duplicate, recovery, repair or stray wake that launches nothing writes
  nothing to Paperclip — no comment, no status — so an old wake can never change an active or
  newer turn. It may only observe. Paperclip's own retry for its missing comment is bounded
  (one missing-comment retry, at most two repair wakes), and those wakes are no-ops too.
- **Settled before the next turn.** A follow-up is journaled only when the previous turn's
  disposition is positively applied or definitively rejected, or, if none was attempted (a
  runner lost or stopped before publishing), when its termination is proven by its receipt or
  `pool.reconcile`. An unconfirmed write blocks the conversation instead of racing it; starting
  a new conversation is the escape if it never lands.
- **Submission evidence.** A runner admits the pending turn only when Paperclip holds its exact
  marker (turn number, prompt digest, assignee): the issue description for turn 1, a comment for
  follow-ups. A journaled follow-up whose POST was refused or never applied cannot be executed
  by a late or repair wake; an accepted-but-unknown one may be, once.
- **Resume.** Coordinator follow-ups post the comment with `resume: true`, Paperclip's explicit
  follow-up intent. It reopens a closed or blocked issue and, unlike a plain comment, is not
  held after an operator cancel. Follow-up comments and run dispositions use separate
  deterministic id spaces.
- **Cancellation.** A Paperclip cancel can kill the runner's whole process group before the
  host receipt returns. The controller keeps `transport_lost` or `runner_lost` with termination
  `unknown`; `pool.reconcile` (or the next admission on the account) proves the host turn ended,
  releases the account and writes `turns/<n>.reconcile.json`, which status reports as
  `hostTermination` beside, never over, the original evidence.

## Data and identity

Coordinator store (`$CODEX_CLAUDE_HOME/pool/`, 0700/0600):
`conversations/<conversationId>/conversation.json` (threadId, profile, bindingSha256,
provider, issueId), `turns/<n>.json` (coordinator-owned intent: prompt digest, submission
state `posting|unknown|submitted`, replySource/reason), `turns/<n>.claim/` and
`turns/<n>.run.json` (runner-owned: Paperclip run id, remote run uuid, receipt),
`session.json` (runner-owned native session id and drift flag), `control/` (answers/stops),
`answers/` (audit), `cursor.json` (Paperclip log offset and fold), `issues/<issueId>.json`
(index). `accounts/<account>.json` holds controller-side reservations.

Host store (worker's `$CODEX_CLAUDE_HOME`): `pool-host.json` (operator-staged profile
entries), `pool-locks/<workspace digest>/`, `pool-runs/<runUuid>.json` (receipt) and the
normal bridge `runs/<id>/` guardian directories.

Exit codes from the runner (Paperclip run result): 0 provider turn ended with verified
termination (outcome is in the log), 75 refused before any provider process, 78 binding or
configuration refused, 124 stopped with verified termination, 125 termination unknown.

## Validation

Deterministic tests with a fake Paperclip API, fake `ssh` and fake provider CLIs cover:
end-to-end streaming and a live Claude question/answer through the spool and SSH stdin;
Codex `needs_input` and follow-up resuming the same native session; duplicate runs and
uncertain issue creation (no second provider call); stale question ids; autonomous reply
limits; tool-permission refusal without `source: user`; unavailable native auth and
unknown/exhausted quota; Paperclip log cursor replay across a coordinator restart;
session and binding drift; concurrent writers; cancellation; and runner loss with lease
expiry and reconciliation. Live acceptance (real SSH, Paperclip enrollment, real Codex and
Claude nonce turns, coordinator restart, independent artifact reads) is owned by root and
pending. Remote Claude live testing is pending native sign-in.
