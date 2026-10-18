---
roadmap: MO-26-10-18-07.11.35
date: 2026-10-18
agent: codex
---

# Durable CD V2 controller

Preparation: read the pending CD V2 design, research, validation, Morpheus
workflow and current context records. Claimed a separate temporary worktree;
implementation waits for the design merge. The child runtime exposes no graph
MCP tools; the parent reports blocked graph enumeration before delegation.
The bootstrap check reports no exact index or enabled watching, so structural
evidence is explicitly limited to targeted source reads, without graph claims.

Agreed integration seams with the native uploader and Evo consumer: a durable
build reservation precedes dispatch; dispatch passes immutable intent, attempt,
source, control, configuration and input identities; the generic upload hook
claims before contact with Apple and records its upload resource immediately.
Full-test evidence joins the runtime inventory to each actual test result.
Duplicate/uncertain upload claims refuse replay. Consumer configuration carries
all app/group/environment identities and command paths.

The existing Evo recovery worker supplies useful Codex JSON execution and owned
process-guardian mechanics. Its Evo-specific authority and PR-only completion
prompt cannot transfer as the generic repair lifecycle. No model invocation or
Apple operation occurred during preparation.

Implementation began only after design PR #415 merged. Integrated reviewed native
adapters from PR #416. Added the controller, exact single-parent GitHub store,
source/Actions/Apple adapters, evidence and upload hooks, bounded repair worker,
actual subscription usage readers and scoped GitHub OIDC capability helpers.
The first source typecheck and compile passed; 39 focused domain/store/provider
cases passed, including real local Git and ES256 signing. Opened draft PR #417
early so full CI could run. Its initial typecheck passed and lint identified eight
unused symbols/dead expressions; removed them before the final focused check.

The independent initial review blocked eight concrete protocol counterexamples.
Added persisted random invocation ownership to same-ID CAS transitions; visibility
sweep and bounded retry to uncertain hosted dispatch, including completed runs
that never claimed work; Git blob reads and compact test proofs for large state;
ordinary waits for native capacity/provider outages; terminal-run and later host
quiescence consumption with PR-free infrastructure recovery; pinned validator
verification at downloaded artifact ingestion; untracked input rejection; and
production app-age preservation across repeated controller-only repairs.
Regression cases exercise each sequence rather than just its individual helper.
The actual native upload receipt producer supplies the resource-only artifact
integration fixture, including its real ios-upload-acceptance-* artifact name.
Additional guards retain late evidence without reviving retired attempts, enforce
live group cursor and operator pause, and prevent accepted upload replacement.

Final local validation: `pnpm exec vitest run tests/cd tests/cli-args.test.ts
tests/cli-dispatch.test.ts` passed **223/223** (65 CD cases, 158 CLI cases).
`pnpm typecheck`, `pnpm lint`, and `pnpm compile` passed. No local full suite:
CI owns that check. The actual Evo consumer config passes the compiled offline
validator. Registry metadata checked XState 5.33.3 (no declared dependencies;
modified October 17) and Octokit REST 22.0.1 (four direct dependencies; modified
July 24); retained existing gh/jose and the small domain reducer, with no added
runtime dependencies. Architecture, API/operator docs and compiled output agree.

These results do not establish actual hosted OAuth/App capabilities, subscription
model recovery, or internal TestFlight availability. Those remain the parent-led
consumer acceptance campaign. No model invocation or Apple mutation occurred in
this implementation worktree. The initial blocked review is retained and requires
an independent follow-up on the fixed head before merge.

The same-reviewer follow-up identified a retirement interleaving: an acceptance
hook could commit between an absent-provider snapshot and the retirement CAS.
The retirement transition now rechecks its current active/latest identity,
accepted timestamp/outcome, terminal workflow, host quiescence and observation
window atomically. An actual Controller/GitHubStore interleaving regression
injects acceptance immediately before retirement, checks the next tick burns no
new build, then completes the original exact receipt. A positive control still
replaces a genuinely absent uncertain upload after all required evidence.
The focused controller/state/store run passed 49/49; typecheck, lint, compile
and diff check passed. The initial blocked review remains unchanged.

The next same-reviewer turn kept CDCORE-009 blocked: a second poller could persist
an exact build observation, pause before acceptance, and lose to an absent poller.
Retirement now also refuses any current persisted matching build ID. The regression
runs two actual controller ticks, pauses the visible poller before acceptance,
and proves the absent poller cannot retire or replace it before original delivery.

Both b2 and a16 CI completed the tests but failed the committed-declaration check:
Zod's tuple enum maps a string union whose declaration order depends on TypeScript
literal interning elsewhere in the program. The new CD import graph exposed this.
My earlier restoration of the unrelated-looking generated order was incorrect.
Changed NoteSource to Zod's enum-object overload, preserving values and runtime
option order while stabilizing its declaration. The new regression emits the actual
team schema with an unrelated manual literal checked first and last; both outputs
match. Repeating it with the original tuple via an in-memory compiler-host mutant
produced different declarations, proving the regression detects the original defect.
CD, CLI, team and declaration tests passed **263/263**; typecheck, lint and compile
passed. No full local suite was run.

Review history retained: initial f2 review blocked CDCORE-001 through 008 during
the observed UTC clock interval 14:35:04–14:41:04 (360000 ms, 6 minutes; the first
0.236-second source read preceded the first captured clock). Follow-up b2 blocked
CDCORE-009 during 14:47:33–14:49:42 (129000 ms, 2.15 minutes). Follow-up a16 retained
CDCORE-009 during 14:52:10–14:52:58 (48000 ms, 0.8 minutes). The parent reports
Christopher explicitly authorized continued same-reviewer turns beyond the cap
as part of the CTO campaign and reaffirmed implementation through the agreed
budget limits and success criteria at 2026-10-18T13:50:22.909Z. The next review
must cover both the visibility interleaving and declaration fix; no clearance
is inferred from the earlier turns.

## Independent review record

Independent high-risk review blocked eight findings initially, then retained a ninth retirement-race finding across two follow-ups. The author fixed all nine and CI declaration drift. The explicitly authorized fourth same-reviewer turn cleared exact commit 9366b52617bc17981687fb95cb273be33ad16a50 with no remaining findings; full CI passed.

The final same-reviewer turn independently ran 87 focused tests, typecheck and fresh declaration emits. It verified the two-poller interleaving preserves build 8 and the original receipt, refuses replacement, and preserves enum values and runtime option order. Full CI run 39138088790 passed. Earlier blocked outcomes and measured intervals remain below; the fourth turn carries Christopher's explicit continuation authorization.

```morpheus-review
{
  "version": 2,
  "base": "fe381bbf4382ece7f252731bebddd411aa0eaf6f",
  "reviewed": "f2e3adba8cc0911900cb34188b0aa5fc25c04ec5",
  "covered": "9366b52617bc17981687fb95cb273be33ad16a50",
  "authorSession": "01a14e59-b8cf-75f3-98a4-742b7927c7f0",
  "reviewerSession": "/root/cd_core_review",
  "risk": "high",
  "elapsedMinutes": 6,
  "timing": {
    "source": "clock",
    "durationMs": 360000,
    "evidence": "Parent-captured observed UTC clock interval for initial reviewer turn: 2026-10-18T14:35:04Z to 2026-10-18T14:41:04Z. The first 0.236-second source read preceded the first captured reading; this is the observed clock interval, not an invented full-run duration."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review blocked eight findings initially, then retained a ninth retirement-race finding across two follow-ups. The author fixed all nine and CI declaration drift. The explicitly authorized fourth same-reviewer turn cleared exact commit 9366b52617bc17981687fb95cb273be33ad16a50 with no remaining findings; full CI passed.",
  "findings": [
    {
      "id": "CDCORE-001",
      "severity": "substantive",
      "description": "Concurrent identical transition IDs could authorize two irreversible effects.",
      "paths": [
        "src/cd/store.ts",
        "src/cd/cli.ts",
        "tests/cd/store.test.ts"
      ],
      "disposition": "fixed",
      "response": "Persisted a random invocation owner; only the committed owner receives non-replayed authorization. Same-ID contention and lost-acknowledgment regressions pass."
    },
    {
      "id": "CDCORE-002",
      "severity": "substantive",
      "description": "Hosted dispatch could strand after a lost POST acknowledgment or completed workflow that never claimed work.",
      "paths": [
        "src/cd/worker.ts",
        "tests/cd/worker.test.ts"
      ],
      "disposition": "fixed",
      "response": "Visibility sweeps precede bounded ordinal redispatch; completed waiting invocations close and a new invocation can resume."
    },
    {
      "id": "CDCORE-003",
      "severity": "substantive",
      "description": "Contents API encoding:none above 1 MiB made a growing ledger unreadable.",
      "paths": [
        "src/cd/store.ts",
        "src/cd/schema.ts",
        "src/cd/state.ts",
        "tests/cd/store.test.ts"
      ],
      "disposition": "fixed",
      "response": "Read the exact Git blob through its commit tree and retain compact verified test proofs. An actual state JSON larger than 1 MiB reads and updates."
    },
    {
      "id": "CDCORE-004",
      "severity": "substantive",
      "description": "Ordinary native capacity exhaustion became permanent repairing state without an attempt.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/errors.ts",
        "src/cd/apple.ts",
        "src/cd/store.ts",
        "tests/cd/controller.test.ts"
      ],
      "disposition": "fixed",
      "response": "Capacity, provider outages and rate limits produce durable retryable waits; future ticks admit work after capacity returns without manufacturing a repair."
    },
    {
      "id": "CDCORE-005",
      "severity": "substantive",
      "description": "A failed pre-upload self-hosted attempt never consumed later quiescence, while repair completion required a fake code PR.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/state.ts",
        "src/cd/worker.ts",
        "tests/cd/controller.test.ts"
      ],
      "disposition": "fixed",
      "response": "Failure reconciliation identities include later quiescence. Operational repair can complete from direct evidence; terminal workflow and host quiescence precede retry, preserving source/build debt."
    },
    {
      "id": "CDCORE-006",
      "severity": "substantive",
      "description": "Controller artifact ingestion accepted payload hashes without checking the pinned validator bytes.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/source.ts",
        "tests/cd/controller.test.ts"
      ],
      "disposition": "fixed",
      "response": "Downloaded evidence now passes the same exact control/source validator check as CLI ingestion before artifactsVerifiedAt can commit."
    },
    {
      "id": "CDCORE-007",
      "severity": "substantive",
      "description": "Source verification ignored untracked native files injected after selecting immutable inputs.",
      "paths": [
        "src/cd/source.ts",
        "tests/cd/adapters.test.ts"
      ],
      "disposition": "fixed",
      "response": "Exact source verification checks all untracked files under configured inputs. The real Git injection regression refuses an added Swift file."
    },
    {
      "id": "CDCORE-008",
      "severity": "substantive",
      "description": "Repeated controller-only repairs reset production source age despite unchanged app input digest.",
      "paths": [
        "src/cd/state.ts",
        "tests/cd/state.test.ts"
      ],
      "disposition": "fixed",
      "response": "Use the earliest matching input digest in immutable intent lineage; repeated unchanged-input repairs retain eligibility while app changes reset age."
    },
    {
      "id": "CDCORE-009",
      "severity": "substantive",
      "description": "An absent provider poll could retire an upload after a concurrent accepted hook or exact-build observation committed.",
      "paths": [
        "src/cd/controller.ts",
        "tests/cd/controller.test.ts"
      ],
      "disposition": "fixed",
      "response": "Retirement atomically rechecks current active/latest identity, accepted timestamp/outcome, every persisted build observation, terminal workflow, quiescence and window. Interleaving tests retain original bytes; a positive control still replaces true absence. The final exact-head same-reviewer turn cleared both interleavings and the original-receipt regression."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/cd_core_review",
      "commit": "b2f67180e15cfd21c6778f5470b430a7338f6d82",
      "outcome": "blocked",
      "elapsedMinutes": 2.15,
      "timing": {
        "source": "clock",
        "durationMs": 129000,
        "evidence": "Parent-captured UTC reviewer interval 2026-10-18T14:47:33Z to 2026-10-18T14:49:42Z."
      },
      "summary": "The original eight findings were addressed; new substantive CDCORE-009 reproduced acceptance committing after absence observation but before retirement."
    },
    {
      "reviewerSession": "/root/cd_core_review",
      "commit": "a16cabf10a345097e1119a709b480871b9e9738a",
      "outcome": "blocked",
      "elapsedMinutes": 0.8,
      "timing": {
        "source": "clock",
        "durationMs": 48000,
        "evidence": "Parent-captured UTC reviewer interval 2026-10-18T14:52:10Z to 2026-10-18T14:52:58Z."
      },
      "summary": "Acceptance race fixed, but CDCORE-009 remained blocked: persisted exact build visibility before the acceptance transaction could still lose to an absent poller."
    },
    {
      "reviewerSession": "/root/cd_core_review",
      "commit": "9366b52617bc17981687fb95cb273be33ad16a50",
      "outcome": "cleared",
      "elapsedMinutes": 0.8333333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 50000,
        "evidence": "Parent-captured UTC reviewer interval 2026-10-18T14:56:13Z to 2026-10-18T14:57:03Z for the exact 9366b52617bc17981687fb95cb273be33ad16a50 follow-up."
      },
      "humanAuthorization": {
        "approvedBy": "Christopher",
        "approvedAt": "2026-10-18T13:50:22.909Z",
        "reason": "Christopher explicitly authorized the CTO campaign to continue beyond the three-review-turn cap through the agreed budget limits and success criteria, reaffirmed by the instruction to implement the plan as guided above."
      },
      "summary": "Cleared exact head with no remaining findings. Two-poller reproduction preserves build 8 and the original receipt and refuses replacement; enum accepted values and runtime order are unchanged. Independently passed 87 focused tests, typecheck and fresh declaration emits."
    }
  ]
}
```
