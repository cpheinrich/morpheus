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

The paired Darwin implementation compressed 12 selected pages from 24,887 to 12,044 words (51.6%)
and kept legal and agent-centered records unchanged, providing the first measured evidence for the
new standard.

## Review response — 2026-11-05

- `HQB-01`: narrowed this Morpheus item to the reusable standard and Darwin/Evo pilot. Lakina
  adoption is now explicitly owned by `LK-26-11-05-01.39.21` in the Lakina repository instead of
  remaining hidden unfinished scope.
- `HQB-02`: propagated the canonical preservation contract verbatim to both product/design skills
  and both reviewer personas: decision or action, owner, deadline, thresholds, material evidence,
  caveats and compliance constraints. The persona test now asserts that contract, the 75-word
  executive-brief threshold and the full exemption semantics.
- `HQB-03`: corrected the final paired Darwin count to 12,044 words at the reviewed implementation
  head; the 51.6% reduction is unchanged.

## Independent review

Fresh review found three issues: the item still claimed unfinished cross-project scope, propagated personas weakened the preservation contract, and the paired Darwin count was stale. The item now owns only the shared standard and Darwin/Evo pilot, Lakina has its own item, every skill/persona/generated bundle carries the exact contract, the count is corrected, and both follow-ups cleared the final head.

```morpheus-review
{
  "version": 2,
  "base": "49f7dd23ce7920083faa26f8bdd62537f1cccad6",
  "reviewed": "91b3ac09d95124d0223cbdb5b7803be262968578",
  "covered": "74ed82e8053b54de5527ccaa2b8ab538d60cc1aa",
  "authorSession": "01a188d6-2e82-74b3-bff6-5e6eca3a905a",
  "reviewerSession": "/root/morpheus_hq_brevity_review",
  "risk": "normal",
  "elapsedMinutes": 3.24875,
  "timing": {
    "source": "runner",
    "durationMs": 194925,
    "evidence": "Codex rollout task_started 2026-11-05T09:37:38.178Z to task_complete 2026-11-05T09:40:53.103Z for reviewer session /root/morpheus_hq_brevity_review."
  },
  "outcome": "complete",
  "summary": "Fresh review found three issues: the item still claimed unfinished cross-project scope, propagated personas weakened the preservation contract, and the paired Darwin count was stale. The item now owns only the shared standard and Darwin/Evo pilot, Lakina has its own item, every skill/persona/generated bundle carries the exact contract, the count is corrected, and both follow-ups cleared the final head.",
  "findings": [
    {
      "id": "HQB-01",
      "severity": "substantive",
      "description": "The roadmap item claimed Lakina and additional cross-project pilots that this branch had not completed, so merge would falsely reconcile unfinished scope as shipped.",
      "paths": ["hq/product/roadmap/MO-26-10-29-11.15.23-pilot-hq-design-standard.md"],
      "disposition": "fixed",
      "response": "Narrowed the Morpheus item to the reusable standard and Darwin/Evo pilot and named project-owned Lakina item LK-26-11-05-01.39.21 for the remaining adoption work."
    },
    {
      "id": "HQB-02",
      "severity": "substantive",
      "description": "Product/design skills and both reviewer personas weakened the canonical preservation terms, and the generated product guide still distributed the old contract.",
      "paths": [".agents/skills/chief-product-officer/SKILL.md", ".agents/skills/vp-design/references/hq-experience.md", ".github/agent-review-prompt.md", "src/review/local-prompt.ts", "src/product/skill.ts", "dist/product/skill.js", "tests/agent-instructions.test.ts"],
      "disposition": "fixed",
      "response": "Propagated the exact decision-or-action, owner, deadline, thresholds, material-evidence, caveats and compliance-constraints contract; synced generated skills; and added threshold, preservation and exemption assertions. Independent focused tests passed 27/27."
    },
    {
      "id": "HQB-03",
      "severity": "minor",
      "description": "The worklog reported 12,039 final Darwin words while the reviewed implementation recorded 12,044.",
      "paths": [".agent/worklog/2026-11-05-hq-brevity-guidelines.md"],
      "disposition": "fixed",
      "response": "Corrected the evidence to 12,044 words; the 51.6% reduction is unchanged."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_hq_brevity_review",
      "commit": "7d7f0b0fc2b6c8247d6cab114b33ec3c5f2e61e7",
      "outcome": "blocked",
      "elapsedMinutes": 1.4115333333333333,
      "timing": {
        "source": "runner",
        "durationMs": 84692,
        "evidence": "Codex rollout task_started 2026-11-05T09:47:19.243Z to task_complete 2026-11-05T09:48:43.935Z for the resumed reviewer."
      },
      "summary": "HQB-01 and HQB-03 were fixed and canonical prose was corrected, but the generated product-skill bundle still carried the old contract, leaving HQB-02 open."
    },
    {
      "reviewerSession": "/root/morpheus_hq_brevity_review",
      "commit": "74ed82e8053b54de5527ccaa2b8ab538d60cc1aa",
      "outcome": "cleared",
      "elapsedMinutes": 0.4073,
      "timing": {
        "source": "runner",
        "durationMs": 24438,
        "evidence": "Codex rollout task_started 2026-11-05T09:49:41.301Z to task_complete 2026-11-05T09:50:05.739Z for the resumed reviewer."
      },
      "summary": "The generated product-skill source and distribution now match the canonical skills; 27 focused tests passed and all findings are fixed with no new findings."
    }
  ]
}
```
