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
