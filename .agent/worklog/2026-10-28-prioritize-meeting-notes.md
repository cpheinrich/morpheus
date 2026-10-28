---
roadmap: MO-26-10-28-12.35.17
tags: [engineering, operations, governance]
agents: [codex]
---

# Prioritize Gemini meeting note summaries

## Outcome

New Gemini discovery records now declare discovery version 2 and the versioned
`priority-first-v1` layout. Their first three level-two sections are an executive summary, key
decisions and key action items; supporting context, discussion and open questions follow. The
shared validator checks both order and non-empty content, ignores headings inside fenced examples,
and runs in both `team validate` and immutable canonical-source ingestion.

Historical compatibility is explicit: discovery version 1 and ordinary meeting notes without a
format declaration remain valid. The bounded frontmatter summary still supplies catalog and
authorized notice text, while the body executive summary can carry fuller headline context.

The canonical README, scaffold pointer, shared meeting-intake guide, both provider skill
entrypoints, architecture specification and decision record now state the same contract.

## Build-versus-borrow decision

Considered `mdast-util-from-markdown` 2.1.0 (last published 2026-10-03) and `marked` 18.1.2 (last
published 2026-10-26). The requirement is only to find three level-two headings outside fenced code,
so the implementation remains a small domain-specific scanner rather than adding a general Markdown
AST or renderer dependency.

## Verification

- `pnpm exec vitest run tests/team.test.ts tests/meeting-intake.test.ts tests/init.test.ts
  tests/project-skills.test.ts` — 137 focused tests passed, including legacy compatibility,
  ordering, empty-section, explicit-none, fenced-code, immutable-reader and scaffold cases.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm compile` — passed and refreshed the committed `dist/` artifacts.
- `pnpm test` — the single allowed local full-suite run passed all 3,443 tests across 122 files.
- `pnpm morpheus pm index` — passed; generated product indexes were already current.
- `git diff --check` — passed.

## Tooling note

The codebase-memory installation check passed, but every graph call for this checkout returned
`Transport closed`. Discovery therefore fell back to direct source reads and targeted `rg` only
after the graph failure. All changed source, documentation and test paths were read directly, and
the focused and full suites exercise their material boundaries.

## Independent review

Pending.
