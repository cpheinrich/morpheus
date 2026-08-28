---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-12.49.05
outcome: review
---

# Repair brand retrofit identity and imagery contracts

## What changed

- `brand init` now resolves explicit flags first, then `morpheus.json`, and uses the worktree name
  only as a fallback. Manifest project prefixes retain the existing two-letter token convention.
- The retrofit appends only missing raw moodboard and heavyweight concept-media rules to
  `.gitignore`, preserving project-owned policy and staying idempotent.
- The shared imagery schema preserves an optional non-empty `editorialBoundary` per asset.
- Local `check pr` failures now name `MORPHEUS_PR_BODY`, the input the command actually reads.

## Issue audit

Issues #122 and #123 report the same manifest/retrofit defect and share this resolution. #149 is a
small independent correction in the same brand contract. Issue #112 needs no new mechanism: the
visual-first workflow merged in PR #120 stopped exact seeded-document comparison, and the current
suite already proves enriched strategy and visual-system records remain complete. It will be closed
with that evidence rather than reimplemented.

## Verification

- Focused TypeScript and brand/check/init suite: 3 test files and 148 tests passed.
- Issue #112 was closed with direct evidence from PR #120 and the current enriched-document test.
- Final verification: 33 test files and 990 tests passed; TypeScript typecheck, build, PM index and
  validation, team validation, and `git diff --check` passed.
- The refreshed graph recorded no coverage gaps in the changed brand, CLI, or PR-check source paths;
  test files are deliberately outside the moderate graph and were read and run directly.
