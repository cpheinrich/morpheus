---
roadmap: MO-26-09-13-15.14.54
agent: codex
date: 2026-09-13
---

# Prevent stale context certification

Traced Codex SessionStart through the generated shim to `context brief`, and traced explicit
refresh through remote observation, receipt creation and the CLI report. The hook deliberately
discards certification and performs no checkout mutation; that trust boundary is sound. The gap is
that refresh records the live trunk SHA without proving the working source contains it, and after
SessionStart there is no previous receipt left to expose the missing commits.

Implemented native-Git source alignment before receipt creation. A clean trunk fast-forwards but
receives no receipt until the changed files are re-read and refresh runs again. Dirty trunks, stale
feature branches, divergence and fetch failures fail closed without rewriting work. Added real Git
lifecycle tests and updated architecture, project instructions, and scaffolded instructions. A
registry search found no reason to replace the small native Git boundary with a dependency.

Validation: `pnpm vitest run tests/trunk-changes.test.ts tests/session-gate.test.ts` passed the
focused context suite; the final `pnpm test` passed all 1,306 tests. Typecheck, lint, compile, PM
validation/indexing, and `git diff --check` also passed and are recorded in the PR test plan.
