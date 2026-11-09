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

Review found a missing timeline for projects with explicit Tantivy mode and no
rollout. The standalone MCP mode now uses an opaque session key and emits the
same lifecycle events without changing startup policy. A focused regression
and the no-prompt app-server probe both pass for this mode. The report now
counts first-search cache hits separately from warm-ups finished before the
prompt. The expanded focused suite passed 171 tests.

Independent review cleared background warming and launch-to-result profiling after the standalone Tantivy and cache attribution fixes.

The base and both PR CI attempts also hit the same expired Factory quota fixture.
Its seven-day reset had passed by the actual run date. A late, independently
reviewed correction advances a test clock as the account response arrives.
`node --test plugins/factory/tests/config.test.mjs` passed 23 tests. An isolated
reviewer mutation sampling the clock before the fetch still failed the test.

```morpheus-review
{
  "version": 2,
  "base": "db1c3f76c367d0f39739126e20aeda0d2b5dea42",
  "reviewed": "3179d79ce0a714de745042085021818fa2066928",
  "covered": "9bb1c0b3aca9bf654045f0fad0f3e55eb63212c6",
  "authorSession": "01a1b4d0-b0d9-7cd1-9f03-33349cd7f590",
  "reviewerSession": "/root/context_warm_review",
  "risk": "normal",
  "elapsedMinutes": 1.6528166666666666,
  "timing": {
    "source": "clock",
    "durationMs": 99169,
    "evidence": "Root clock around reviewer invocation and initial verdict: 2026-11-09T19:24:59.377Z to 2026-11-09T19:26:38.546Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared background warming and launch-to-result profiling after the standalone Tantivy and cache attribution fixes.",
  "findings": [
    {
      "id": "CTX-1",
      "severity": "substantive",
      "description": "An explicit Tantivy MCP project without a rollout warmed but could not join launch, prompt, search and result timing.",
      "paths": [
        "src/context-search/rollout.ts",
        "src/context-search/trace-pipeline.ts",
        "src/cli/session-start.ts"
      ],
      "disposition": "fixed",
      "response": "Assign an opaque session key to explicit Tantivy MCP, allow the profile to join without an experiment and prove the standalone mode."
    },
    {
      "id": "CTX-2",
      "severity": "minor",
      "description": "A launch warm can complete even when the first search uses a different corpus or ripgrep.",
      "paths": [
        "src/context-search/trace-pipeline.ts",
        "docs/runbooks/context-search.md"
      ],
      "disposition": "fixed",
      "response": "Clarify launch-corpus scope and count first-search cache hits separately."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/context_warm_review",
      "commit": "6f6104e32f991f3451a2a8840a2c9a6cc8f229c2",
      "outcome": "cleared",
      "elapsedMinutes": 0.6543166666666667,
      "timing": {
        "source": "clock",
        "durationMs": 39259,
        "evidence": "Root clock around follow-up invocation and verdict: 2026-11-09T19:27:29.055Z to 2026-11-09T19:28:08.314Z."
      },
      "summary": "Both original findings fixed. Reviewer verified the exact commit and independently passed 31 focused tests."
    },
    {
      "reviewerSession": "/root/context_warm_review",
      "commit": "9bb1c0b3aca9bf654045f0fad0f3e55eb63212c6",
      "outcome": "cleared",
      "elapsedMinutes": 0.7222333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 43334,
        "evidence": "Root clock around late correction reviewer invocation and verdict: 2026-11-09T19:33:46.887Z to 2026-11-09T19:34:30.221Z."
      },
      "scopeReason": "Factory CI failed at the exact base and both PR attempts when the fixed quota fixture expired. Change only that test's clock so the required check can pass without changing product behavior.",
      "summary": "One test fixture corrected. Reviewer independently passed all 23 config tests and demonstrated that sampling time before inventory still fails the corrected fixture."
    }
  ]
}
```
