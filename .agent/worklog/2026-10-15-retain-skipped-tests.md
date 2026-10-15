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
