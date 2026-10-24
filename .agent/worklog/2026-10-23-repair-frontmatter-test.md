---
agent: codex
date: 2026-10-23
roadmap: MO-26-10-23-17.22.53
outcome: review
---

# Repair frontmatter test import

Typecheck after merging #376 failed because `tests/agentic-cto-skill.test.ts` still imported the
removed `gray-matter` package. Replace only that import with the maintained fork pinned in
`package.json`. This repair is isolated from Manager authority draft #460.

Focused `pnpm exec vitest run tests/agentic-cto-skill.test.ts` passed 31 tests. `pnpm typecheck`
and `pnpm compile` passed; `pnpm morpheus pm index` changed no generated indexes, and
`git diff --check` passed. The full suite is left to CI because only one existing test import
changed and no shared core code changed.
