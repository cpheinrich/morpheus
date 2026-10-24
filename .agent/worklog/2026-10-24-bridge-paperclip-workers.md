---
roadmap: MO-26-10-24-00.59.32
agent: codex
---

# Mandate and checkpoint

Outcome: Chris's latest request is interactive delegation from this existing Codex app
conversation through the existing bridge and Paperclip to remote Claude and Codex workers.
Authority: implement, test, independently review, merge and reversibly install this integration
on the already authorized MBP and Zoe mini. No provider credential copying, new paid service,
API fallback, consumer deployment or production migration. Normal repository controls remain.
Latest direction: “This is an unsupervised session from now on. Get as far as you can with
the implementation.” Do not wait for routine implementation choices.

Budget grant received 2026-10-24: “draw down codex usage to 25% weekly remaining ... use the
delegation tool [for Claude] ... draw down claude to 40% weekly remaining.” Codex baseline
56% weekly used/44% remaining, hard ceiling75% used; admit below72% leaving3 points reserve.
Fresh native Claude OAuth usage at2026-10-24T08:06:11.988Z: weekly39% used/61% remaining,
five-hour20% used; hard weekly ceiling60%, admit below57%, reserve3 points. Included ordinary
subscription usage only; no extra usage (provider reports disabled), API or credit fallback.
Reserve bounded episodes before dispatch; retain unknowns at maximum. Recheck before each
episode and periodically during long episodes, stop at admission ceiling. Main coordinator,
implementation, design/review and live calls all count. Shared-account other activity counts
against the same hard ceilings.

Evidence: last old Claude bridge run baa74aa5-a93e-40dd-af1d-14a35e37a409 is terminal/completed;
no unfinished delegated writer carried in. Remote mini SSH reachable, native Codex signed in
using ChatGPT. Native Claude auth reports loggedIn=false/authMethod=none. Chris explicitly
said to continue without the remote Claude login; do not copy another machine's login.

Graph: Tier2 intended, project Users-chrisheinrich-code-morpheus. Index/status, symbol search
and coverage calls failed Transport closed. Exact source fallback covers bridge Manager,
guardian, provider argument builders, store/client/MCP/viewer; installed Paperclip process
adapter, native runtime, quota helpers and upstream docs. No graph completeness claim.

Proposed design and acceptance are in docs/paperclip-interactive-bridge.md and
qa/acceptance/MO-26-10-24-00.59.32.md. Fresh Claude delegation will critique before authoring;
Codex owns runtime deployment, acceptance readback and a separate fresh independent review.

## Budget reservations

- Implementation/design episode: reserve up to8 Claude weekly points, then settle from fresh
  native provider telemetry. No other Claude episode admitted concurrently. Root reserves
 4 Codex points for integration/operations, leaving independent review and live-test headroom.
- Pending: final review and live calls, individually reserved after current episode settles.

## Coordinator checkpoint — 2026-10-24T08:39Z

Claude episode4e038e60-d895-42fc-a201-bbcc7dbde6d2 is terminal/completed; source commitf278853.
65 deterministic plugin tests passed; no remote/provider acceptance is implied. Fresh native
Claude weekly usage42% (baseline39%, delta3 points, includes shared-account activity) and
five-hour31%; extra usage disabled. Settle the first8-point reservation at3, release5.
Codex currently60% weekly used (baseline56%, delta4, shared account); settle root's4-point
reservation. Reserve another6 Codex points for integration, live testing and final review
(including up to3 points for the fresh reviewer), still below admission72/hard75.
Reserve up to4 Claude points for a targeted hardening episode, stop this episode at46% used;
the engagement still admits below57 and never beyond60.

Latest human authorization: “I just got on to the mac mini and logged in to Claude ...
upgraded ... $20 per month pro plan ... mint a token if you want ... permit ... browser ...
google SSO with Zoe's google acct”. Native host CLI still reports loggedIn=false/authMethod
none on both installed paths. The trusted upstream native quota helper reports no available
native OAuth token. Controllable MBP browser had Chris's Claude/Google sessions; switching to
the specified Zoe account reaches a passkey challenge requiring a person. Asked asynchronously
for the mini's own CLI login; continue other work. No provider credential copied or minted,
no API key/billing fallback. Pending test login subprocess was stopped; browser handoff retained.

Registered two new Paperclip process agents, paused with canAssignTasks/canCreateAgents/
canCreateSkills allfalse: miniCodex2bab3420-d100-4619-829a-a4887c3cbc5e and
miniClaude d6e7256d-bcec-4cf6-8319-325812d32c08. These have no assigned jobs or model calls.
Private enrollment journals and readback are at ~/.local/share/morpheus-paperclip/
interactive-20261024; no existing worker binding was repointed. Earlier workers stay paused.
Mini Codex native quota at08:09Z was0% used, future reset2026-10-31T04:50:06Z.

## Live iteration — first real protocol results

Source hardening fe00aa9 is committed with71 deterministic tests passing. Claude episode
c0d19bf4-d7bf-472d-a32b-7be5a2dc65a4 is terminal; reported weekly usage remained42% at its end
(not a claim of zero token use; keep1 point for reporting granularity/shared activity).
Reserve a third targeted Claude implementation episode up to4 points, stop at47% weekly used;
no other implementation author until it returns. The whole engagement hard limit remains60.

Staged immutable archives f278853 thenfe00aa9 in a private test runtime on both hosts, with a
separate coordinator store, canonical dedicated workspaces and native quota readers. Existing
personal bridge source/configuration and prior pilot identities were not replaced. A third,
local Claude acceptance profile uses agent ed9712ff-75f5-4154-804e-eaf80aebd3a4; its purpose is
real provider control validation while mini native login remains unavailable, not a substitute
for remote Claude acceptance. The remote Claude run refused native_auth_unavailable before
launch and proved termination not-started; no API or paid fallback was used.

Mini Codex conversation06f8cde0-ebc6-4ca7-b32a-5cc5841be108, issue78196d5c-4cc2-4d36-a8c0-
5569aa5497ba: run2b21223f-eac5-4d68-af9d-84c1201351dc streamed progress and returned needs_input;
run33fea3d3-ad6e-435f-b496-f99d9bbd9278 resumed native session01a16d14-9e8a-7983-abd2-
9d46dca37f32 and completed the answer. Independent SSH JSON parsing verified both nonce
artifacts and labelblue. Run a61e4e0a-b544-4541-8dd2-c2656eb5f3e4 remained running with the
same native session across coordinator shutdown/restart; the capture is codex-active-reconnect.json.
Paperclip cancel killed the relay before its receipt returned: controller correctly retained
transport_lost/unknown, host later recorded interrupted/verified, and pool.reconcile proved
termination and released the account. Do not rewrite that unknown controller result as success.

Actual Paperclip behavior exposed integration gaps: completed generic process runs without
task comments/disposition triggered missing_issue_comment and issue_disposition_repair runs.
The immutable claims prevented those from launching a second model. A later fourth turn
after cancellation stayed queued and was stopped before launch; retain the failed drill,
diagnose explicit resume/manual-cancel hold rather than blindly wake the agent. The runner
must honor Paperclip's existing completion protocol and exact submitted-turn identity.

Local Claude conversation0f9b0ac9-67d5-46bb-9dc8-41b62cdcfa1d, issuefababac8-9ec2-43c4-
b1b7-4e349ced2d22, runa1b02043-fa90-4963-821e-36f6224ed092: real AskUserQuestion appeared,
coordinator answeredblue with a reversible-fixture reason, same in-flight native session
90535e28-e933-4a0f-8ba3-ec873f45430e completed. Independently parsed both artifacts. Requested
sonnet/medium, observed claude-sonnet-5-5 from init, observed effortunknown. Provider-reported
tokens are retained separately from subscription quota. These are live local Claude results.
Private immutable captures, journals and quota wrappers are under interactive-20261024.

## Protocol checkpoint — 2026-10-24T09:08Z

Source16829e8 has76 passing plugin tests and run-attributed task disposition, exact committed
marker admission, resume:true and separate later host-termination proof. Episode4b616c57-
de9b-4707-9a00-88187223177f is terminal/completed. Reported Claude weekly usage remained43%;
its4-point reservation is released except1 point held for reporting granularity/shared work.
Reserve up to2 more Claude points (account admission cap46% used for this short episode) for
removing the documented disposition/follow-up race and automatic retries of uncertain agent
writes. The engagement's hard limit remains60% used. Do not treat an absent comment marker
as proof an earlier mutating request cannot still apply.

Local Claude follow-up run0be59c6d-4074-4138-ad84-7704af7341fb reused native90535e28-e933-
4a0f-8ba3-ec873f45430e; independent read of claude-followup.json matched the remembered nonce,
labelblue and phase3. Mini Codex native weekly quota after the first3 model turns moved0→1%
used; the later fourth request did not launch. All3 new profiles are paused while restaging.
Native log paging was checked directly with limitBytes1024: the API does supply nextOffset
when partial, and pool.logs returned that cursor. The original first probe had used the wrong
limit parameter; do not claim the API lacks paging.

origin/main advanced to660211f (#474); merge it after the source author returns, before the
final review. That is a main integration, not a scope change. Source author owns no live
mutations; root keeps staged archives and actual failed probes immutable.

## Claude implementation episode (delegated, 2026-10-24)

Read AGENTS.md, decisions, learned, inbox, the proposed design and acceptance. Graph tools were
not used (Tier 2 previously reported Transport closed); exact-source reads covered the bridge
(service, guardian, claude/codex-exec, config, store, client, MCP), the pilot worker/supervisor,
the PR #470 linkage client, and the installed Paperclip 2026.1012.0 process adapter, adapter-utils
env, run-log store, heartbeat-run/issue/comment routes and the vendored `paperclip-runner`.

Critique and choice are recorded in `docs/paperclip-interactive-bridge.md`. Native Runner
rejected on installed-source evidence (ACPX Claude: Agent SDK 0.3.286, isolated
`CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`, model `claude-sonnet-5`;
Codex: `@openai/codex` 0.160.0 with `.paperclip-auth-staging-v1`; runtime requests only for
`runtimeMode: native`). Process adapter chosen; it passes no task id and has no inbound channel,
so the runner resolves the issue via `GET /heartbeat-runs/:id/issues` and receives answers/stops
from an owner-only spool — controller and coordinator must share a host (true today).

Prototype first: an end-to-end test through a fake `ssh` (pipes, so a kill closes the host's
stdin) proved the riskiest path — Paperclip-log streaming, a live Claude `control_request`
answered through spool → SSH stdin → guardian → provider, and a resumed follow-up — before the
coordinator operations were widened.

Dead ends and findings, all retained:
- The worktree had no plugin `node_modules`; the host failed to import `ws`. The runner failed
  closed exactly as designed (`transport_lost`, termination unknown, exit 125, reservation held).
- Zod 4 `z.record(z.enum(...))` is exhaustive; a host configuring quota for one provider was
  rejected. Switched to `z.partialRecord`.
- The issue index was published with `writeFile(wx)`; a concurrent duplicate runner read the empty
  file and refused (safe, wrong category). Now temp file + `link()` for an atomic exclusive publish.
- macOS `/var` → `/private/var` and a 077 umask in this environment broke two test assumptions;
  fixtures use `realpath` and explicit `chmod`.

Implementation (plugins/codex-claude): `src/pool-config.mjs` (profile/host schemas, binding
digest, quota judgment ported from the pilot rule, SSH argv/env), `src/pool-store.mjs` (journal,
claims, markers, account ledger), `src/pool-paperclip.mjs` (bounded REST client),
`src/pool-host.mjs` + `scripts/pool-remote.mjs` (host binding, native auth, quota admission and
meter, workspace lock, Manager/guardian reuse, receipts, reconcile), `src/pool-runner.mjs` +
`scripts/pool-runner.mjs` (Paperclip process-adapter command), `src/pool.mjs` (coordinator
operations), `prompts/pool-handoff.md`; Claude event folding extracted to `applyClaudeEvent`;
service/MCP/CLI wiring with the loop guard extended to `pool.start`/`pool.followup` and CLI
`start`/`codex.start`.

Tests run (all deterministic, no model calls):
- `node --test tests/pool.test.mjs` — 9 integration tests: SSH Claude live question + follow-up
  resume; Codex needs_input continuation, supervision limit and user reset; uncertain creation with
  three concurrent runs → one provider call; unknown submission never reposted without `retry`;
  auth/quota/host-binding/tool-permission refusals; binding and session drift; stop before/during a
  turn and Paperclip SIGTERM; SSH kill → transport loss with reservation held until reconcile;
  coordinator restart reattach with cursor replay and no lease dependence.
- `node --test tests/pool-units.test.mjs` — 8 unit tests (quota boundaries, profile refusals,
  digest sensitivity, SSH quoting/env, markers/request ids/API origins, fold, host file, CLI loop
  guard).
- `pnpm check` and `pnpm test` in the plugin: 65/65 pass after updating the MCP tool list test.
- Root: `pnpm typecheck` pass; `pnpm compile` left `dist/` unchanged; `pnpm morpheus pm index`
  unchanged. Root `src/` untouched, so no root vitest scope applies; full root suite not run.

Pending (root): independent review; deployment of the canonical plugin to the MBP and the mini
(installed copies untouched here); `pool.json`, token file and host `pool-host.json` staging;
Paperclip agent registration from `pool-agent-config`; live verification of the Paperclip
assumptions listed in the design (agent-key access to `/heartbeat-runs/:id/issues` and
`/issues/:id`, assignment and `issue_commented` wakes, `reopen`, `clientRequestId`, issue-list
filter, board-only cancel); real SSH drills; real Codex nonce turns; remote Claude live acceptance
pending native sign-in.

## Claude hardening episode (2026-10-24, after f278853)

Root's review found that `pool.*` bypassed the bridge's coordinator invariants. Pool admission
now goes through `Manager.poolAdmission` (draining, global/task/project off for caller and
conversation owner, live Codex snapshot, `assertPoolAuthority` sandbox rank) and answers through
`Manager.poolControl`; `Pool` refuses every mutation when no verifier is supplied. Host paths
are canonical (`canonical()` in pool-config; launch-time `lstat` + `realpath`), workspaces may
not nest and state may not overlap a workspace. The delegated-worker guard now also covers
`pool.answer` and `pool.reattach` with `retry` (CLI and MCP). Receipts/status carry
`requested`, `observed` and provider-reported `usage`.

Finding while testing: an earlier unit fixture placed the workspace inside the host state
directory; the new overlap rule refuses it, so the fixture moved, not the rule. Every pool test
now goes through the real Manager gate with a stubbed live snapshot.

Commands and results:
- `node --test tests/pool-units.test.mjs tests/pool.test.mjs` — 22 pass (11 unit + 11
  integration), including zero-POST/zero-provider denials for read-only, unknown sandbox,
  unknown approval, unreadable snapshot, invalid id, task off, project off, mode off, draining;
  continuation from another authorized session and refusal from a read-only one or after the
  owner is off; observation with no live session; symlinked workspace refused at the host with no
  provider call; nested workspaces, symlinked config and `/var` alias refused.
- `node --test tests/mcp.test.mjs` — 2 pass (delegated MCP mutations refuse, no bridge started).
- `pnpm check`; `pnpm test` — plugin suite 71/71 pass.

Acceptance coverage re-checked against qa/acceptance: repeated/uncertain submission, stale
question ids, autonomous limits, permission escalation (tool permission and now coordinator
sandbox rank), native auth/quota, cursor replay, session/binding drift, concurrent writers
(profile idle, account ledger, canonical host lock), cancellation and reconnect are each covered
by a deterministic test. Live acceptance remains pending with root.

## Claude protocol episode (2026-10-24, after fe00aa9)

Diagnosis from the pinned 2026.1012.0 source (bounded reads): `heartbeat.js`
`finalizeIssueCommentPolicy`/`findRunIssueComment` queue `missing_issue_comment` for a succeeded
run with no comment whose `createdByRunId` is that run; `recovery/legacy-continuation.js`
`decideLegacyContinuation` queues `issue_disposition_repair` (max 2) when a succeeded legacy run
leaves its issue `todo`/`in_progress`. `middleware/auth.js` derives the run from
`X-Paperclip-Run-Id`. `routes/issues.js` honors `clientRequestId`/`commentClientRequestId` only
for user actors (12760, 9664), so agent writes need journal-and-observe idempotency. Comment and
PATCH `resume: true` is the explicit follow-up intent (moves to todo, carries
`resumeIntent/followUpRequested`); `issue-comment-wakeup.js` suppresses self comments, so runner
dispositions do not wake the agent. I did not pin the exact line that held the fourth follow-up
after the operator cancel; `resume` is the documented explicit path, and the fake models the
observed hold rather than claiming the mechanism. Root's live probe should confirm.

Implemented: run-attributed dispositions with a journal (`done`/`blocked`), no-op wake comments
that never change status and settle an unsettled latest disposition (observe first),
upstream-marker evidence before any claim, `resume: true` follow-ups, separate id spaces, and
`hostTermination` from reconcile (manual or at the next admission) beside the original unknown
evidence. Two test setups were wrong, not the code: the fake set every issue `in_progress` at
run start (the server only checks out `todo`), and two tests acted before the fake provider had
started or reported its session; both now wait for real progress.

Commands: `node --test tests/pool-protocol.test.mjs` 5 pass (disposition per state with the
server's post-run policy; refused/unapplied vs accepted-unknown follow-ups against late and repair
wakes; duplicate wake during an active turn; unknown disposition observed vs re-sent; a real
runner subprocess killed by process group with later host proof and an explicit resume
continuing native session sess-1). `pnpm check`; `pnpm test` 76/76. Residual race: a no-op wake
settling turn n can race a follow-up journaled after it re-reads the conversation; the window
is one request, and the follow-up's own run still admits on its marker.

## Claude correction episode (2026-10-24, after 16829e8)

Root identified two blocking defects in 16829e8: a no-op/repair wake re-sent an unknown agent
PATCH when its marker was absent (absence cannot prove a timed-out write will not land, and
agent request ids are ignored upstream), and a no-op could PATCH an older turn's status while a
newer follow-up was being journaled. Fixed without a new framework: no-op wakes are now
observation/log-only (no comment, no status); a disposition is sent once by the turn's own
runner and an unknown result is settled only by exact positive observation of that run's
marker (`observeDisposition`, used by no-op wakes, `pool.reattach` and the follow-up gate, and
only once the writing runner is finished or gone); `Pool.unsettled` refuses a follow-up unless
the previous disposition is applied or definitively rejected, or none was attempted and
termination is proven (receipt or reconcile). Cancellation before disposition still resumes
the same native session after `pool.reconcile`. The documented residual race is removed: no
remaining path changes issue status except the turn's own runner before it finishes.
Trade-off accepted: no-op runs leave Paperclip's bounded missing-comment/repair wakes (one and
at most two), which are themselves no-ops.

Commands: `node --test tests/pool-protocol.test.mjs` 5/5 (applied-but-unknown observed with no
re-send; delayed PATCH never re-sent, follow-up refused while unconfirmed, two old wakes and a
reattach write nothing, then the late write lands, observation settles it and the follow-up
runs; duplicate wake during an active turn writes nothing; cancellation follow-up refused until
reconcile, then resumes sess-1). `pnpm check`; `pnpm test` 76/76.

## Native blocked contract and concurrent follow-up correction

The real server rejected protocol conversation 114bca4e-e800-4fce-9fea-d5c32cde963e's first
needs-input disposition with HTTP 422. Installed route/schema source requires a first-class
unblock route; a question comment is insufficient. The runner now supplies board-owned
`unblockDescriptor` for blocked and clears it on done. The fixture models that native refusal.
The failed live result remains in the private evidence; a later turn will qualify the fix.

A new simultaneous-followup test failed before correction (two successful submissions allocated
the same turn). The shared coordinator service now refuses the second request before allocating
or writing intent. The regression verifies one comment, one winning prompt and one next turn.
Validation: protocol tests 7/7, plugin `pnpm check` and `pnpm test` 78/78. Root typecheck,
compile and PM index ran; generated tracked files remained unchanged. No root full suite
was needed for plugin-only source changes; CI owns it.

The graph server recovered after earlier transport failures: generation 2026-10-24T07:59:43Z
indexes the primary checkout. Coverage reports the new pool modules/tests missing there;
task-worktree source reads remain the evidence. No graph completeness claim is made.
Mini Claude CLI still reports loggedIn false on the latest native check despite web sign-in.
