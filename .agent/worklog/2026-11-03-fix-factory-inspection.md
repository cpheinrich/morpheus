---
date: 2026-11-03
roadmap: MO-26-11-03-12.41.12
tags: [engineering, factory]
---

# Repair Factory desktop inspection

Factory's provider-neutral and compatibility tools used only the MCP process's environment
identity. On desktop that identity can be missing or belong to an archived chat. Both refuse
before routing, while the independent doctor command can still read healthy gateway quota.
Codex's native MCP implementation overwrites request `_meta.threadId` with the caller's ID;
the bridge now reads that field, with an environment fallback for older hosts. Model arguments
cannot select the owner. A socket-level MCP regression exercises two chats through the same
process, including a stale environment and forged compatibility arguments.

The unloaded-task metadata reader also accepts in-place zstd compression and reports missing
metadata clearly. It never searches for another session, reopens an archived turn, or relaxes
active-turn/freshness/permission validation. Regression cases include compressed active/completed
turns, corrupt compression and absent files. Node already ships zstd; no dependency was added.

The remote Paperclip profile error is a separate, unconfigured execution surface, not evidence
that gateway quota or gateway delegation is broken. No remote profile or account was invented.
No user implementation was delegated as part of diagnosis. The current root stays the manager.

## Validation

- `node --test tests/mcp.test.mjs tests/snapshot.test.mjs` in `plugins/factory`: 9 passed
  on the initial implementation; rerun after final edits below.
- `node scripts/check.mjs` and `pnpm test` in `plugins/factory`: passed, 155 tests.
  This covers the bridge, MCP transport, ownership, metadata and gateway dependents.
- `pnpm exec vitest run tests/factory-distribution.test.ts`: 3 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`: passed; no generated drift.
- Root full suite was not run locally because shared core was not changed; CI owns it.
- Independent review and post-install live inspection are recorded below when complete.

## Open questions

None for this repair. Registering a new remote Paperclip pool is outside the gateway-inspection fix.
