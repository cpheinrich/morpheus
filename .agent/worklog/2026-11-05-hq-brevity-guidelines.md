---
id: MO-26-10-29-11.15.23
title: "Add brevity to the HQ design standard"
date: 2026-11-05
tags: [product, design, ux, hq]
---

# Add brevity to the HQ design standard

## Why

The Darwin/Evo HQ design pilot improved hierarchy and component consistency, but Chris's Vercel
review found that its current-direction callout and many human-facing documents still demanded too
much reading. The concrete correction was “Ship v1 of iOS app,” with a ten-word maximum and no
implementation detail in the headline. He also requested a roughly 50% compression pass on
text-heavy pages, excluding legal documents and agent-centered records such as roadmap tickets.

## Change

- The HQ product/design runbook now defines a current-direction limit of ten words, a 75-word or
  five-bullet executive brief, and a 40–60% reduction target for bloated human-facing legacy prose.
- The preservation rule names decisions, actions, owners, deadlines, thresholds, material
  evidence, caveats and compliance constraints; exact tables and evidence are not treated as prose
  debt.
- Legal/compliance documents and agent-centered records—roadmap tickets, worklogs, inboxes, agent
  logs and raw meeting/source records—are exempt.
- The long-page outline threshold is now 800 words, so shortened but still substantial pages retain
  navigation.
- The CPO and VP Design skills carry the same contract. The canonical Codex skills were synced to
  Claude and to the generated product-skill bundle.
- Both the repository reviewer prompt and the local independent-review prompt now check the
  contract. Minor copy preferences stay notes; failing an explicit HQ brevity/hierarchy acceptance
  criterion is substantive.

## Validation

- `node scripts/sync-product-skills.mjs` regenerated the Claude mirrors and product-skill bundle.
- `pnpm exec vitest run tests/agent-instructions.test.ts tests/project-skills.test.ts
  tests/review.test.ts` — 107/107 passed. The first assertion used a literal phrase and failed when
  Markdown wrapped between “ten” and “words”; the test now normalizes whitespace and checks the
  actual contract rather than line wrapping.
- `pnpm typecheck` — passed.
- `pnpm compile` — passed and refreshed the committed reviewer/product-skill artifacts.
- `pnpm morpheus pm index` — unchanged.
- `pnpm test` — 140 files and 4,235 tests passed. It ran once because the shared local-review
  prompt changed.

The paired Darwin implementation compressed 12 selected pages from 24,887 to 12,039 words (51.6%)
and kept legal and agent-centered records unchanged, providing the first measured evidence for the
new standard.
