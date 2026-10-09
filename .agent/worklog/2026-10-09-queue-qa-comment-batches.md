---
date: 2026-10-09
agent: codex
roadmap: MO-26-10-09-16.02.57
outcome: in-progress
summary: Durable agent-neutral QA comment queue with exclusive claims and honest overlay status.
---

# QA comment queue

Chris sent multiple batches during Evo iOS comment QA and asked for them to
accumulate without occupying the interactive chat. The existing pending
directories preserved them, but there was no exclusive consumer claim and a
fresh Codex checkout had no wake route. The configured webhook in Evo's primary
checkout targets another routine and was not copied.

The shared writer now publishes the complete batch atomically. Agents reserve
oldest unclaimed batches with an identity, resolve them as that identity, or
release them after failure. Claims persist across process exits; force release
is an explicit recovery action after confirming the responder stopped. New
batches remain queued while earlier ones are claimed. Both overlays report the
open count and whether a wake route is configured. The guide and skills use the
same agent-neutral contract for Claude, Codex, Grok, and other hosts.

The queue cannot start a background Codex turn by itself. A host-provided
responder or wake route is still necessary for automatic handling while the
interactive chat remains free. With no route, the overlay tells the person to
message the agent to resume.

Focused verification: `pnpm exec vitest run tests/qa-comments.test.ts
tests/qa-web.test.ts tests/qa-preview.test.ts` (97 passed), `pnpm lint`,
`pnpm typecheck`, and `pnpm compile` passed. `pnpm morpheus pm index` made no
changes. Tests cover concurrent claims, later batches, wrong-agent resolution,
claim recovery, and queue status in the simulator overlay response. Independent
review is pending.
