---
tags: [engineering, devops, infrastructure]
roadmap: MO-26-10-25-04.30.30
agent: codex
---

# Controlled HQ transport qualification

## Readiness checkpoint — implementation incomplete

The parent CTO assigned a controlled, test-only Firebase/Auth/Functions/Firestore
qualification through the existing single Manager-owned HQ Pool and Paperclip remote
native workers. Production auth, public endpoints, consumer rollout, multiple companies,
new credentials, installed personal-plugin replacement and historic task reruns are
outside scope. The task owns this worktree and its harness, documentation, acceptance,
worklog and ignored private proof only.

The source checkpoint adds an explicit provider-free real-emulator/actual-Manager
fixture, a separate native opt-in harness, and an operator runbook. The fixture joins
the transport to the real facade and existing Pool with fake upstream/native tools;
it exercises question handling and a saved receipt after deliberate acknowledgment
loss with exact effect/file assertions. The native harness persists intent, verifies
source/target pins and paused/idle admission, reuses the same home/account ledger,
allows only bounded tiny nonce writes, independently SSH-reads artifact bytes and
finally observes exact operations and restores resumed test agents to paused.

Only the wrapper's three process-isolated guard tests have run. The joined emulator
fixture and native harness are not yet executed or independently reviewed. PR505 is
waiting on an unrelated existing QA UI CI repair; the parent requested this durable
checkpoint and will resume this author after that dependency merges. No provider
was started and no live adapter, HQ mapping, role, credential or agent state was changed.

## Budget and operational observations

The assigned qualification reserve is at most10 shared Codex percentage points,
including native Codex and review, with hard75% used and earlier admission stopping
at68–70%. Initial fresh account observation was34% used; the latest check was35%.
Other parent activity shares that account, so this is an observed account delta,
not per-task billing. Ordinary subscription use was allowed. No reset, API/overage
spending or main Claude was admitted.

Both exact enrolled remote test agents were read back paused with process adapters,
disabled periodic heartbeat and on-demand wake enabled. A scoped issue census found
two historical completed issues each and no unfinished assigned work. All three
existing account reservation arrays were empty. No controller runner/service process
or bridge socket was found. The current live adapters still point to the old private
controller runtime. None of that runtime has been updated by this author.

The remote host remains the older installed runtime. Actual source hashes were read
for host, runner, config and service, without changing them. Host max-run is360s;
Codex primary stop/hard limits are72/75, and Claude weekly limits57/60. Existing
guards remain unchanged; this checkpoint does not claim that a newly staged controller
runner has been adopted or that the remote host includes the new HQ admission source.

The supplied fresh Zoe Claude quota reader failed with its fixed unavailable error.
One different bounded diagnostic in the same supported GUI audit session confirmed
the existing credential was available but the native usage endpoint returned the
authentication category (401/403). No token or raw provider text was printed, refreshed,
copied or minted. The prior0% observation is stale. Claude remains not-run because
fresh ordinary quota is unknown; no weakened guard or model launch is authorized.
The parent explicitly agreed to retain that result and continue eligible Codex work.

The pinned installed Paperclip2026.1012.0 server source confirms exact POST
`/agents/:id/resume` and `/agents/:id/pause`; pause cancels active runs. Its agent
PATCH merges a partial `adapterConfig` into existing values, so a future runner-path
change can send only `args` and preserve the existing environment without copying
redacted API values. The list endpoint supports explicit limit/offset; the harness
uses bounded complete pagination before admission.

## Discovery and choices

Tier2 discovery began with graph project `Users-chrisheinrich-code-morpheus`, ready
with11,112 nodes. Exact-checkout bootstrap initially reported a missing index; the
required install completed and indexed this worktree. It also closed the active MCP
transport and requested session restart. Subsequent graph search and the one coverage
call for all candidate evidence paths failed `Transport closed`. Exact source fallback
covered Manager, Pool/HQ, config, store, runner/host boundary, shared fixtures, transport
backend/connector/wrapper and closeout exporter. New harness files have no usable graph
coverage proof in this session. No exhaustive graph claim is made.

Registry inspection found Commander15.0.0, last modified2026-09-02, with no runtime
dependencies. Existing Node `parseArgs` handles two fixed test modes in a small wrapper;
the domain-specific qualification needs no new generic framework or package. The
settled choice is recorded in decisions. The optional Firebase SDK package remains the
separately reviewed transport's dependency boundary.

## Validation at checkpoint

- `node --test scripts/paperclip-hq/run-qualification.test.mjs` passed3/3. It asserts
  explicit mode selection, no child launch for invalid native intent, exact provider-free
  fixture command, and preservation/refusal of an existing operator settings file.
- `node --check scripts/paperclip-hq/native.mjs`, `qualification.mjs` and
  `run-qualification.mjs` passed at that checkpoint. This is syntax validation only.
- Real joined emulators, native admission/artifacts/cleanup, frozen closeout export,
  typecheck/compile/PM checks, independent review, PR and CI remain outstanding.

The exact continuation commands and private runtime identities are in the ignored
`local/handoffs/hq-native-qualification.md` within this task worktree. Do not start a
second Pool or native intent to compensate for missing observations.
