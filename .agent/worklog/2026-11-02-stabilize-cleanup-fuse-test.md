---
roadmap: MO-26-11-02-13.21.09
date: 2026-11-02
agent: codex
outcome: completed
tags: [engineering, devops]
---
# Stabilize cleanup-fuse timing assertions

## Result

Issue #560 records 2998–2999 ms observations failing the real-process three-second lower bound.
The compiled quota/worker test now allows 50 ms of observation tolerance while retaining the
four-second upper bound, exact signal sequence, exit status and diagnostic assertions.
The existing deterministic unit test now asserts SIGTERM alone at 2999 ms, then SIGTERM/SIGKILL
at exactly 3000 ms. Production timeout values and behavior are unchanged; no dependency needed.

## Validation

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`
and `git diff --check` passed. Focused quota-reader and compiled CLI suites passed 126 tests;
one full `pnpm test` passed 4,150 tests across 138 files in 105.81 seconds.
Direct source review used the existing fixture and production cleanup path;
graph tooling was unavailable with other active sessions preventing safe bootstrap activation.
