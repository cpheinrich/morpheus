---
date: 2026-11-09
agent: codex
roadmap: MO-26-11-09-12.38.42
outcome: review
tags: [engineering]
summary: Added an explicit one-shot command that approves enabled Codex hook changes for the current Git project.
---

# Approve pending Codex project hooks

A person can ask their agent to run `morpheus codex hooks approve` inside a checkout.
Codex lists its current definitions and owns the versioned config update. We filter to
enabled project hooks at the root, use the main checkout for a linked worktree, and verify
the recorded hashes. The helper is never invoked by project setup or startup.

Reused Morpheus's checkout identity and Codex home resolution. Used the existing Node
stdio and readline APIs for the small app-server exchange, with no new dependency or
separate approval database. An initial implementation used a for-await loop that would
close the shared reader on the first response. Reading the next line directly keeps the
connection open for the full approval and verification exchange.

## Verification

- `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index`.
- `pnpm exec vitest run tests/codex-hooks.test.ts tests/doctor-codex-trust.test.ts`
  (29 tests). The new tests cover the exact write scope, linked checkout routing, no-op
  and list-error paths, and config conflicts.
- `morpheus complexity check` passed (CCN limit 15).
- The compiled CLI against the Mac app's bundled backend with an isolated `CODEX_HOME`:
  approved a new hook, made a repeat invocation a no-op, approved a changed definition,
  and preserved unrelated trust. The live config was left for the user's later trial.
