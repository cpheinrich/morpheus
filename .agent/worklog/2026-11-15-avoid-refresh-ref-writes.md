---
date: 2026-11-15
agent: codex
roadmap: MO-26-11-15-00.23.56
tags: [engineering, agent-workflow]
summary: "Verify refresh source without writing Git refs."
---

A fresh desktop session started with workspace-write and outbound network
disabled. Git's remote query reproduced its DNS error in that sandbox. A
network-enabled workspace query reached GitHub, but the original refresh
still failed to create its temporary ref under Git metadata.

The new refresh compares two live observations and uses the existing local
ancestry check. A moving or unreachable trunk still refuses an online receipt.
Startup and claim still prepare source as before.

The regression test failed before the change because Git could not write its
temporary ref. After the change, the regression, the moving-trunk check, and
the existing behind and same-branch rollback tests passed. The compiled CLI
issued the real two-record receipt using the original session's read evidence
in a workspace-write sandbox with network available and Git metadata protected.

- `pnpm exec vitest run tests/session-start.test.ts tests/session-gate.test.ts tests/trunk-changes.test.ts` ran 92 tests.
- `pnpm exec vitest run tests/session.test.ts tests/session-evidence.test.ts tests/session-git.test.ts` ran 79 tests.
- `pnpm typecheck`, `pnpm compile`, `pnpm lint`, `morpheus complexity check`, and `git diff --check` passed.
- `pnpm morpheus pm index` and `pnpm morpheus pm validate` passed.
