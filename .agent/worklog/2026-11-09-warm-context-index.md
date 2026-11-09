---
date: 2026-11-09
roadmap: MO-26-11-09-11.18.21
tags: [engineering]
summary: "Warm Tantivy as soon as a project MCP server starts and profile the first lookup."
---

A recent Evo cold lookup spent 2.25 s building the index and 2.82 s overall.
The first search was the second tool call, about 30 s after the host's first-turn
boundary. Earlier follow-ups in the same checkout took about 0.36 s.

A local Codex app-server probe started a thread without sending a prompt or
requesting the MCP catalog. The host launched the context server immediately.
It supplied no session ID at launch, so an opted-in project warms the full
worktree before arm assignment. The effective search arm is chosen as before.
The desktop determines when the draft becomes a project thread, and Morpheus
cannot measure the New chat click itself. A changed or narrower corpus still
needs its own index. Concurrent searches in one process reuse the same pending
build. Separate processes retain the existing atomic publication rule.

In isolated copies of the live Evo and Lakina context inventories, the installed
Codex host launched the candidate MCP before a synthetic prompt. Evo warmed in
2.17 s and returned its first cached result in 0.56 s. Lakina warmed in 1.71 s
and returned its first cached result in 0.56 s. These are individual probes,
with no model calls and no pilot trace pollution.

The profile joins opaque session timing, a prompt-hook timestamp or the local
Codex first-turn boundary, first search and first nonempty response. It tracks
host-visible search results separately. Evo's prompt hook is currently untrusted
on this machine. Lakina's is trusted. No hook permissions were changed.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm compile`,
`pnpm morpheus pm index`, and `git diff --check`. With the pinned Tantivy
binding, `pnpm exec vitest run tests/context-*.test.ts tests/session-start.test.ts tests/profile/*.test.ts`
passed 170 tests. `morpheus complexity check` passed with two cognitive
advisories in the trace serialization and aggregation entry points. The
in-flight build and historical empty-result boundaries are covered by focused
regressions. See [context search](../../docs/runbooks/context-search.md).
