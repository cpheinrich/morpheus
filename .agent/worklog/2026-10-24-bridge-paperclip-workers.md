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
