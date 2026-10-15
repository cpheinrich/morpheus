---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.11.39
outcome: review
summary: Retain skipped iOS test identifiers beside the selected identifiers in each CI evidence bundle.
---

# Retain skipped iOS test identifiers

Issue #403 came from the independent review of PR #402. The reusable iOS CI
workflow already passes both test-selection inputs to xcodebuild, but exported
only the inclusion list. The evidence step now saves the exclusion list in
`skip-testing.txt` in the same result directory, including the empty default.
The workflow input documents the retained file.

Focused validation: `pnpm exec vitest run tests/workflows.test.ts` passed
162 tests. `pnpm typecheck`, `pnpm compile`, and
`pnpm morpheus pm index` passed. The workflow test asserts both environment
bindings and both exact evidence writes. No macOS CI run is available locally;
CI will exercise workflow parsing and the complete suite.

Codebase-memory installation reported active sessions it could not safely stop,
and no exact-checkout index was available. Source inspection was scoped to the
workflow, its test, and the originating worklog.

The fresh independent reviewer inspected the workflow's test invocation,
evidence export and upload paths, its nightly forwarding, the ticket and
the focused assertions. The review cleared the change at small risk with
no findings. The reviewer did not rerun the author's passing checks; CI
still needs to execute.

```morpheus-review
{
  "version": 2,
  "base": "8f3132487c274b65641367e80c9773e07942c73b",
  "reviewed": "3e8130528e260f5cf7f34f2b0d9b9fe556998105",
  "covered": "3e8130528e260f5cf7f34f2b0d9b9fe556998105",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/skipped_tests_review",
  "risk": "small",
  "elapsedMinutes": 1.1333333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 68000,
    "evidence": "Author UTC clock readings around reviewer invocation: 2026-10-15 07:14:18 to 07:15:26 UTC, including tool execution and wait."
  },
  "outcome": "complete",
  "summary": "The fresh independent reviewer inspected the workflow's test invocation, evidence export and upload paths, its nightly forwarding, the ticket and the focused assertions. The review cleared the change at small risk with no findings. The reviewer did not rerun the author's passing checks; CI still needs to execute.",
  "findings": []
}
```
