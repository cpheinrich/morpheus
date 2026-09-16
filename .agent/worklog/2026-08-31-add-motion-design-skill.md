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

## Independent review (2026-09-16)

The PR sat unreviewed and conflicting for two weeks after the author-managed review contract
landed, so a fresh session resumed the task, merged current trunk, and ran the review.

Independent normal-risk review of bd9ecbb189240c438d99b72dc8d56b4dd282349e completed in 3 minutes with one minor finding: AGENTS.md's layout table did not list the new .agents/skills/ layer, so the ticket's discoverability goal was met in architecture.md but not in the file agents read first. The author added the row in 41aabf1. Trunk advanced to 3bca65b (PR #246) during the review, so the single same-session follow-up was used for the fix and the integration merge 81794a111ad30d5f750675841e39047d22f8b3fa; the reviewer confirmed the merge carries only this PR's own files, the architecture.md delta is unchanged, init tests pass and committed dist matches src, and cleared it in 0.5 minutes. Not verified: the skill is Codex-only by design (.agents/skills/ is not read by Claude Code), noted as incidental for a future item.

```morpheus-review
{
  "version": 1,
  "base": "5a096dcdd7559aa62c81c8da0241253da68040bd",
  "reviewed": "bd9ecbb189240c438d99b72dc8d56b4dd282349e",
  "covered": "81794a111ad30d5f750675841e39047d22f8b3fa",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "claude-review-179-0402",
  "risk": "normal",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent normal-risk review of bd9ecbb189240c438d99b72dc8d56b4dd282349e completed in 3 minutes with one minor finding: AGENTS.md's layout table did not list the new .agents/skills/ layer, so the ticket's discoverability goal was met in architecture.md but not in the file agents read first. The author added the row in 41aabf1. Trunk advanced to 3bca65b (PR #246) during the review, so the single same-session follow-up was used for the fix and the integration merge 81794a111ad30d5f750675841e39047d22f8b3fa; the reviewer confirmed the merge carries only this PR's own files, the architecture.md delta is unchanged, init tests pass and committed dist matches src, and cleared it in 0.5 minutes. Not verified: the skill is Codex-only by design (.agents/skills/ is not read by Claude Code), noted as incidental for a future item.",
  "findings": [
    {
      "id": "MDS-F1",
      "severity": "minor",
      "description": "AGENTS.md layout table has no .agents/skills/ row, so an agent reading the first-read file does not learn the motion skill exists.",
      "paths": ["AGENTS.md"],
      "disposition": "fixed",
      "response": "Added the .agents/skills/ row under .claude/skills/ in commit 41aabf1, mirroring the architecture.md section 7.1 wording."
    },
    {
      "id": "MDS-I1",
      "severity": "incidental",
      "description": "The skill lives under .agents/skills/, which Codex reads and Claude Code does not, so scaffolded projects expose the procedure to Codex sessions only.",
      "paths": [".agents/skills/motion-design-exploration/SKILL.md"],
      "disposition": "deferred",
      "response": "Matches the ticket and the deferred-plugin decision; a Claude-facing copy is a future item, not part of this change."
    }
  ],
  "followUp": {
    "reviewerSession": "claude-review-179-0402",
    "commit": "81794a111ad30d5f750675841e39047d22f8b3fa",
    "base": "3bca65b0e284ac0ab3cbf6d61329abd7b64962a4",
    "scopeReason": "Trunk advanced to 3bca65b (PR #246) after the initial review; strict branch protection requires integration, so the one same-session follow-up covered the F1 fix and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 0.5,
    "summary": "Follow-up cleared 81794a1: F1 fixed as described, the merge with 3bca65b carries only this PR's own files with an unchanged architecture.md delta, tests/init.test.ts passes and committed dist matches src."
  }
}
```
