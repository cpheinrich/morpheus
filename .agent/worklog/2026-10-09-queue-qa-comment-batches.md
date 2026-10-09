---
date: 2026-10-09
agent: codex
roadmap: MO-26-10-09-16.02.57
outcome: in-progress
summary: Durable agent-neutral QA comment queue and serialized background responder.
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

The background responder reads a local agent command and invokes it in a
separate process. One responder owns the checkout and handles claimed batches
serially, so a later Send appends while the interactive chat stays free. Codex
can use its noninteractive `codex exec` CLI; other agents can supply their own
command. A failed child leaves its claim and stops for recovery. The ownership
marker tells other chats not to edit the same checkout until the responder
stops. The child remains on the QA session branch and commits locally; the
interactive chat completes review and PR work after the session.

Focused verification covers concurrent claims, resolver races, later batches,
wrong-agent resolution, claim recovery, serial background handling, failed
children, and queue status in both overlays. Final check results and review
evidence follow below.

Final local checks: focused QA tests 102/102 passed; full `pnpm test` 2083/2083
passed; `pnpm typecheck`, `pnpm lint`, and `pnpm compile` passed. `pnpm
morpheus pm index --dir hq/product` made no changes. These checks ran after
the resolver race fix and background responder were added.
