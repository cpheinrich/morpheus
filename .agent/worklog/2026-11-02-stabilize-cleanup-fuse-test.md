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

## Independent review

The independent reviewer cleared the exact remote implementation head with no findings. The real-process tolerance preserves bounded cleanup, and deterministic assertions enforce SIGTERM alone at 2999 ms and SIGKILL at 3000 ms. Production code is unchanged; the prior PR580 shipped reconciliation was verified. Independent focused boundary checks passed all three selected tests.

```morpheus-review
{
  "version": 2,
  "base": "132723413f0821d8b3e6295c81875582b7ca47d4",
  "reviewed": "8d9c857f491afba644a9d9702fedc02b391c7a0f",
  "covered": "8d9c857f491afba644a9d9702fedc02b391c7a0f",
  "authorSession": "01a19dd8-f59d-7583-99cf-870ebd3ca0f9",
  "reviewerSession": "/root/review_fuse",
  "risk": "small",
  "elapsedMinutes": 1.4666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 88000,
    "evidence": "Author clock around /root/review_fuse: 2026-11-02 21:40:15 UTC at dispatch and 2026-11-02 21:41:43 UTC on receipt of completed result."
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the exact remote implementation head with no findings. The real-process tolerance preserves bounded cleanup, and deterministic assertions enforce SIGTERM alone at 2999 ms and SIGKILL at 3000 ms. Production code is unchanged; the prior PR580 shipped reconciliation was verified. Independent focused boundary checks passed all three selected tests.",
  "findings": []
}
```

