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

## Independent review

The fresh independent Claude reviewer cleared the exact published candidate with no findings after inspecting the native denial envelope, fail-closed behavior, unchanged authority and guardian cleanup. The reviewer independently passed all 81 focused tests, syntax and whitespace checks. Evidence is synthetic; the live native CLI canary remains an operator activation check after protected merge.

The reviewer used the actual isolated checkout and exact HEAD, read governing context through its scoped MCP with source fallback for acceptance, and reported two non-blocking observations: denial output is not separately journaled and any future mid-turn input must serialize with native responses. Neither changes the existing one-prompt contract. The full review contract was supplied in the packet.

```morpheus-review
{
  "version": 2,
  "base": "0cedb286b11ea26b872738c78f1e659aabe3c460",
  "reviewed": "5efaafbf996e4839520ce86a5e813bb2887fbe5f",
  "covered": "5efaafbf996e4839520ce86a5e813bb2887fbe5f",
  "authorSession": "01a2022f-8c43-7532-9def-41583395f806",
  "reviewerSession": "5c7ff408-3ac3-4296-8ef2-f2626f93dd20",
  "risk": "high",
  "elapsedMinutes": 5.220233333333334,
  "timing": {
    "source": "runner",
    "durationMs": 313214,
    "evidence": "Factory independent reviewer session 5c7ff408-3ac3-4296-8ef2-f2626f93dd20 reported durationMs=313214 with verified termination; private verdict SHA-256 b4983f1d428ceb42d0c94a516a46accc6e8fbd9426e1ec10d6abcd1f92293833."
  },
  "outcome": "complete",
  "summary": "The fresh independent Claude reviewer cleared the exact published candidate with no findings after inspecting the native denial envelope, fail-closed behavior, unchanged authority and guardian cleanup. The reviewer independently passed all 81 focused tests, syntax and whitespace checks. Evidence is synthetic; the live native CLI canary remains an operator activation check after protected merge.",
  "contextRead": [
    ".agent/worklog/2026-11-21-refuse-claude-tool-hangs.md",
    "hq/product/roadmap/MO-26-11-21-23.37.49-refuse-claude-tool-hangs.md",
    "qa/acceptance/MO-26-11-21-23.37.49.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-20-confine-claude-worker-temp.md",
    ".agent/worklog/2026-11-20-add-claude-fleet-workers.md",
    "docs/runbooks/test-quality.md",
    "plugins/factory/README.md",
    "architecture.md"
  ],
  "findings": []
}
```
