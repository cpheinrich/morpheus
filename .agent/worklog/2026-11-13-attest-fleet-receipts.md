---
roadmap: MO-26-11-13-23.32.17
tags: [engineering, devops]
---

Fleet carries the latest verified invocation into the settlement transaction. The
gateway worker distinguishes a CLI `thread.started` event from a preceding
admission's cached session ID. The executor binds recovery to the exact Fleet task
and attempt. The supervisor journals the verified settlement before sending it.
The service commits the receipt with the task, then reads it only on a matching
controller identity and root. A legacy execution without verified invocation
evidence has no receipt. This also separates proof of termination from the model
and task outcomes.

The project-scoped readiness operation returns eligible slots and reports heartbeat
freshness and recent gateway-compatible quota. Capacity and quota observations
end at placement candidacy. Claim and pre-invocation authorization still apply.
No generic module or new dependency is needed. The implementation uses the Fleet
journal, Firestore transaction, and the existing gateway quota reader.

See the earlier [remote worker pilot](2026-11-07-run-factory-workers-remotely.md),
[checkout routing](2026-11-07-route-fleet-checkouts.md), [project isolation](2026-11-08-route-studio-projects.md)
and [operator instructions](../../plugins/factory/README.md#read-slot-readiness-and-a-terminal-receipt).

The test plan uses synthetic Codex events with the real local guardian and executor,
a mocked gateway quota source, and a loopback Firestore emulator. It does not
use a model subscription or alter any deployed resource. Context MCP resolved
the Evo project in the desktop chat, so project context discovery used
`morpheus context search` in this Morpheus worktree. The current trunk graph had
no recorded coverage issue for the affected source and tests. The linked
worktree's exact source and diff were checked directly.
