---
date: 2026-08-31
agent: codex
roadmap: MO-26-08-31-21.40.52
outcome: review
summary: Added a reusable Codex motion-design exploration skill and installed it through every new Morpheus project scaffold.
---

# Add reusable motion-design exploration

## What changed

- Added the repository-owned `.agents/skills/motion-design-exploration` procedure. It turns a long
  one-off prompt into a repeatable comparison workflow: inspect the live shell and brand, separate
  reference material from instructions, research current motion ideas, hold one theme constant,
  produce six genuinely different systems, and stop before implementation.
- Added the same content to `morpheus init` for company, personal, and internal projects. A parity
  test keeps the embedded template byte-identical to Morpheus's own skill.
- Documented `.agents/skills/` as the repository-owned Codex instruction layer and recorded the
  decision to defer plugin packaging.
- The claim-time reconciliation also marks MO-26-08-28-17.55.16 shipped against its merged PR
  #175; no source from that prior item changed here.

## Verification

- The official skill validator reports `Skill is valid!`.
- The focused initializer suite passed 65 tests; the complete suite passed 1,018 tests across 37
  files.
- TypeScript typechecking and compilation passed, including regenerated committed `dist/` output.
- Product indexes were regenerated and remained unchanged.
- The exact worktree index exists, but the codebase-memory MCP transport closed before structural
  queries and coverage checks. Candidate source and test seams were therefore read directly, and
  the complete source suite supplied the behavioral verification.

## Boundaries

This adds the exploration procedure and its distribution only. It does not package a plugin or
implement any production animation. The repository's existing `lint` script could not run from a
clean frozen install because `eslint` is not declared as a dependency; the required typecheck,
test, compile, and index gates all ran successfully. The clean-install lint gap is tracked upstream
as [#178](https://github.com/cpheinrich/morpheus/issues/178).
