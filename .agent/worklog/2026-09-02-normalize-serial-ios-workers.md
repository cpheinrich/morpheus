---
agent: codex
date: 2026-09-02
roadmap: MO-26-09-02-11.49.56
outcome: review
---

# Normalize serial iOS test worker defaults

## What changed

- Normalized the shared nightly workflow's worker ceiling to zero whenever parallel testing is
  disabled, while preserving the caller's ceiling when parallel testing is enabled.
- Updated parsed-workflow regression coverage for the normalized input contract.
- Recorded the coupled-input invariant after Evo's scheduled run exposed the invalid default pair.

## Verification

- Targeted workflow suite: 105 tests passed.
- Full Morpheus suite: 37 files and 1,051 tests passed.
- TypeScript typecheck and `git diff --check` passed.
