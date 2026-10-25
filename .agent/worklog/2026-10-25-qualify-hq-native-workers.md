---
tags: [engineering, devops, infrastructure]
roadmap: MO-26-10-25-04.30.30
agent: codex
---

# Controlled HQ transport qualification

## Actual qualification result

The real demo Auth/Functions/Firestore transport reached the actual Manager-owned
HQ facade, existing Paperclip process adapter and remote native Codex. The start and
one bounded same-session follow-up completed with verified termination. Both
commands deliberately lost their acknowledgment after a local receipt was saved;
a fresh connector instance acknowledged that saved receipt, and replay of the
exact cloud command retained the same conversation and turn. This proves command
delivery/reconnect and this bounded native path; it does not qualify production
HQ auth, a browser UI, multiple companies or migration of Markdown inboxes.

The actual evidence is the
[frozen closeout](../paperclip-closeouts/4925919d-5666-4a4e-b4c5-b59cc0176eee/6483543d-ed4e-4057-ac74-6025716b1184/34b83582b96861ef30520f8bb5da07bb2bca65d0b3547952223f9ac7c57c5b1e.json)
and its two verified63-byte blobs. Independent SSH reads matched phase1
`238d0c14cfd8cc69d956eed219529434e9409c50d5d945fce90131e094f6b2ba`
and phase2 `3db3ac4f751778022dcac6d6184e3959104535a2784c7fbb68d3276d3ff0f6c1`.
Phase2 preserved the original nonce/provider. Remote events show only the intended
file changes and zero command-execution events in both turns. The native exec event
format does not independently report the serving model/effort; configured/requested
`gpt-6.1-sol`/medium remains distinct from that unknown observation.

| Identity | Start | Follow-up |
|---|---|---|
| HQ operation | `9290ddaf-b925-418d-a3b9-871c90c674e4` | `d4727fc2-32ef-4856-8242-d6d1099c35c6` |
| Paperclip run | `9f055ee2-2722-4eb0-ad58-fa32ceb5addf` | `c028d796-17fa-4366-b14b-65e98148d344` |
| Native host run | `12e1f303a201f7c4f018b536abd9235b` | `574461f1664efee66cdeaf033c9a9a89` |
| Verified native time | 2026-10-25T12:25:44Z | 2026-10-25T12:27:39Z |

Both share conversation `835e93b1-d956-47fd-9444-dd292bee78ab`, issue
`6483543d-ed4e-4057-ac74-6025716b1184` and native saved session
`01a17305-fab1-7843-b6ba-0a83f28c025a`, with no session drift. Each first
command receipt was honestly queued/nonterminal; its cloud `completed` state was
not used as native completion. Fresh host quota observed0% primary at12:25:32Z
and12:27:27Z and returned admission under the existing limits. These native-host
quota windows are separate from the coordinating Codex account's42% before launch
and44% after closeout work. Provider-reported output was172 and380 tokens;
input/cached context accounting remains private. No API/overage/reset was used.

Reviewed controller source `a230385ba7532709646bc1855a4e056657c3ac98` was
staged at a new private versioned path with30 exact `src/`/`scripts/` module
hashes; its manifest SHA256 is
`9b74023aa394e081c116e48fc961db36d8fa8261a9ae490c493d165df5c69c9d`.
Only the dedicated Codex test agent's runner arguments changed. Paused readback,
command/cwd/environment and heartbeat settings matched before/after; the existing
Pool home, profiles, remote bindings and account reservation ledger were retained.
The old installed dependency tree supplies the same pinned SDK1.31.0/ws8.21.3/
Zod4.1.12. The remote host remained its older runtime, with actual source hashes
retained privately; source staging does not claim remote runtime replacement.
The personal plugin and local Claude profile were untouched.

At12:29:12Z both enrolled agents were independently read back paused, periodic
heartbeats remained disabled, all three existing reservation arrays were empty,
and no controller bridge socket remained. The remote process/group identities
recorded for each owned native turn were absent. Each native turn's own receipt
also records completed/verified. Raw local intents, cloud/local receipts, remote
events and exact ownership readbacks remain under ignored `local/`.

Claude is deliberately not-run. In addition to the reader's401/403 authentication
category, the parent ran only first-party `/usage` and `/exit` in the existing
Zoe GUI audit session: the CLI reported Claude Pro/Sonnet5.5/medium but usage failed,
with zero model tokens/cost. A bounded supported sign-in attempt reached Zoe's
Google SSO and needed an unavailable owner passkey/password. It was canceled,
with no credentials minted/copied, native account swap or inference, and the
parent verified the original browser account/session was retained. This is
unknown usage access, not evidence of quota exhaustion. Concrete follow-up
MO-26-10-25-05.29.55 owns sign-in plus a fresh guarded Claude qualification.

The closeout acquisition read the exact issue and a bounded complete three-comment
page plus zero interactions, then observed the same data again. Its operator
revision identifies that capture; `cursor: null`, `atomic: false` and the export's
limitation remain honest. Accepted answers and decisions are empty: no operational
comment or done status was promoted to human acceptance. The canonical JSON byte
SHA256 is the recorded snapshot identity; an identical export reported
`created: false`. Both blob hashes/sizes were independently checked. No private
paths or credentials are present in the public snapshot.

After PR510 merged at `cd325c52401527e4ce1e0e34e22e071a9f1f0663`, the
same JSON record produced its adjacent deterministic Markdown view. Its first
render reported `created: true` and exact replay `created: false`, preserving the
canonical JSON snapshot identity. The author read the complete resulting view,
including its empty accepted-answer section, Claude not-run evidence, actual
message identities and both63-byte blob links. Neither renderer nor exporter
asserts human acceptance or a live transactional read. The immutable namespace
forbids a free-form child README; its convention is pointed to from `.agent/README.md`.

## Final validation and delivery

- `pnpm --dir scripts/paperclip-hq run build` passed.
- `node --test scripts/paperclip-hq/run-qualification.test.mjs` passed3/3.
- The explicit `run-qualification.mjs --fixture` real demo-emulator test passed1/1,
  including actual Manager/HQ, fixture native question/answer, exactly one fake issue
  and native launch, reconnect and independently read file content.
- `pnpm exec vitest run tests/paperclip-hq.test.ts tests/paperclip-closeout.test.ts`
  passed44/44. These directly cover the joined transport and exporter dependencies.
- `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` passed before the
  final evidence documentation edits. No local full-suite run; shared core unchanged.
- The path-scoped workflow now runs the guard tests and joined fixture under Node22
  with its existing fixed Firebase/Java pins. Every default path remains provider-free.
- Independent review, final-head CI and merge remain outstanding at this entry.

The integrated Markdown source additionally passed focused76/76 across transport,
JSON exporter and Markdown/history tests. The final integrated typecheck, compile
and PM index were rerun before the PR. This new source integration justifies that
focused expansion; no unchanged full suite was rerun locally.

Independent high-risk review cleared the qualification with no findings. The reviewer
independently passed the3 guard tests and76 focused transport/exporter/Markdown/history
tests, checked the canonical snapshot and both63-byte blob hashes, and corroborated
the retained native/session/cleanup receipts. No provider or live client was invoked
during review. Final-head CI and protected delivery remained the author's responsibility.

```morpheus-review
{
  "version": 2,
  "base": "cd325c52401527e4ce1e0e34e22e071a9f1f0663",
  "reviewed": "5a0e1080386738edfe7cc54c03efd75ea2e6824e",
  "covered": "c29b26c76a8e8e0412b63b8f26338dc08b2dc061",
  "authorSession": "01a172da-309c-7f03-a0b7-06376f645f5a",
  "reviewerSession": "/root/qualify_hq_native/qualification_reviewer",
  "risk": "high",
  "elapsedMinutes": 4.066666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 244000,
    "evidence": "Author clock observed2026-10-25T12:35:16Z immediately before spawning /root/qualify_hq_native/qualification_reviewer; reviewer completed with latest own clock12:38:59Z and author observed2026-10-25T12:39:20Z after receiving the final response. Includes tool execution and waits."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the qualification with no findings. The reviewer independently passed the3 guard tests and76 focused transport/exporter/Markdown/history tests, checked the canonical snapshot and both63-byte blob hashes, and corroborated the retained native/session/cleanup receipts. No provider or live client was invoked during review. Final-head CI and protected delivery remained the author's responsibility.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/qualify_hq_native/qualification_reviewer",
      "commit": "c29b26c76a8e8e0412b63b8f26338dc08b2dc061",
      "outcome": "cleared",
      "elapsedMinutes": 0.75,
      "timing": {
        "source": "clock",
        "durationMs": 45000,
        "evidence": "Author clock observed2026-10-25T12:40:32Z before invoking the same reviewer finalization-only turn and2026-10-25T12:41:17Z after its final response; reviewer latest own clock12:41:06Z. Includes tool execution and waits."
      },
      "summary": "The same reviewer cleared the finalization commit with no findings; only explanatory prose and the accurate initial review record changed.",
      "scopeReason": "Finalize the cleared qualification's readable closeout link, explicit fixture-only question and undeployed UI limits, and initial independent-review record.",
      "finalization": {
        "paths": [
          "docs/paperclip-hq-qualification.md",
          "docs/paperclip-overview.md",
          ".agent/worklog/2026-10-25-qualify-hq-native-workers.md"
        ],
        "evidence": "Inspected the complete 5a0e1080386738edfe7cc54c03efd75ea2e6824e..c29b26c76a8e8e0412b63b8f26338dc08b2dc061 diff and exact changed-path list; verified the linked Markdown artifact exists in that commit. The review record accurately reflects the initial clearance and 3 guard plus 76 focused passing tests.",
        "attestation": "These changes close out behavior already reviewed and cleared. They add no implementation, accepted-design change or normative rule. No source, tests, workflows, native clients or provider effects changed or ran during this finalization."
      }
    }
  ]
}
```

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

Before independent review the MCP connection became available again. Generation
2026-10-25T12:06:16Z metadata matched the HQ facade/shared fixture/exporter without
recorded gaps; new HQ transport/harness and Markdown/history paths were missing
from that primary-checkout generation and received exact source fallback. A narrowed
HQ dispatch search returned1/1, its complete depth1 outbound trace15/15, and its
exact snippet confirmed the retained actor, receipt and existing-Pool boundary.
This remains best-effort Tier2 evidence, not an exhaustive coverage claim.

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

## Delivery observations

The same reviewer cleared the final prose and review-record finalization in45,000ms,
with no findings. Initial source CI finished green at5a0e108:11 checks,8 passed
and3 expected skips. Final review-record validation and final-head CI precede merge.
The private test mapping pins this task worktree; retain it and the ignored proofs
while observing saved HQ receipts. Cleanup must preserve that needed runtime evidence.
