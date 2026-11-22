---
date: 2026-11-21
roadmap: MO-26-11-21-23.37.49
tags: [engineering, devops, factory]
---

# Refuse native Claude tool requests without silent hangs

The unattended Claude relay forwarded live native permission requests but did not answer
them. The interactive bridge already defines the native denial. Fleet's durable controller
question is derived from a structured result after verified cleanup, so it cannot answer a
live tool request without expanding the protocol. The relay now sends an actionable denial
to the same native process. Recognized control frames that are malformed or unsupported
stop the invocation. No permissions, billing, gateway, session or guardian settings changed.

The synthetic fixtures exercise the native stream across chunk boundaries, a safe
alternative that produces a final result, invalid requests and cancellation after a denial.
The implementation does not reproduce a destructive command or invoke a live model.

## Validation

- `node --test plugins/factory/tests/{unattended-worker,gateway-workers,fleet-quota,fleet-runner,fleet-execution,fleet-source}.test.mjs`: 81 passed, none skipped. This covers the relay and its native protocol and Fleet admission, cancellation, quota, source binding and recovery callers.
- `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index` passed; no generated changes.
- `morpheus complexity check --base HEAD --json` passed: 23 targeted functions, maximum CCN 9 of 15, no warnings. The relay's cognitive score fell from 19 in the first draft to 12 after separating event handling from framing.

## Controller verification

The controller verified the downloaded patch digest and exact source, applied it cleanly, and independently reran all 81 focused checks (none skipped), typechecking, compilation and roadmap indexing. Complexity passed against origin/main: 23 targeted functions, 163 functions measured in two files, CCN limit 15. Git diff whitespace checks passed. These synthetic process fixtures establish protocol and cleanup behavior; a live provider canary is retained as a separate operator activation check.

## Remaining delivery

The controller owns independent review and protected CI. Operator rollout and a canary
on the approved native CLI are separate from this private implementation patch.
