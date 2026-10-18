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
cases passed, including real local Git and ES256 signing. Additional controller,
worker and actual receipt-producer integration cases are being completed. The
early draft deliberately precedes final generated output and independent review;
it is not ready to merge or evidence of real TestFlight delivery.
