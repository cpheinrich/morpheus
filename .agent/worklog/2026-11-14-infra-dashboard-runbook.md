---
date: 2026-11-14
roadmap: MO-26-11-14-20.07.10
tags: [engineering, devops, design]
summary: Write the public Infra dashboard design runbook from Darwin's Operations Desk behaviour.
---

# Infra dashboard design runbook

Chris asked for Lakina's Infra tab to match Darwin's Operations Desk and for the design to be
written down in Morpheus so later desks follow it. `docs/runbooks/infra-dashboard-design.md` holds
the contract: tab order (Overview → Devices → Work → Deployments, with Factory only for a verified
feed), the Overview hierarchy, the full-width row button and the linked-row overlay, fragment
addressing with legacy mappings, status wording, operator-gated cross-owner health, and the
synthetic browser checks. It was distilled from Darwin's desk source and its QA worklogs and
checked against Lakina's implementation. All examples are synthetic.

Linked from `architecture.md` (infrastructure desk display), the `AGENTS.md` runbook table, the
docs index, the HQ product design standard and `src/ops-desk/README.md`. No code or dependency.

## Test plan

- `pnpm exec vitest run tests/agent-instructions.test.ts tests/context-search-sources.test.ts`
  (instruction size, runbook links and anchors, record sources): 22 passed.

## Independent review

Independent review cleared the runbook with two minor notes, both fixed in the runbook: it now names the checklist as the target, with Lakina as the conforming desk, and scopes the three-viewer deployed check to private or cross-owner sources.

The Context MCP answered from the Lakina project rather than this checkout, so the reviewer used `morpheus context search` here. It reran the instruction and link tests (22 passed) and checked that the runbook contains no private identifiers.

```morpheus-review
{
  "version": 2,
  "base": "b70808cc385bb2d897f38ad90d3fabb9864d7545",
  "reviewed": "64ac792390635a8483a7b53c2801c63b72f6419b",
  "covered": "1f5fa741f7203fdba181b4f692779d3d761b97a5",
  "authorSession": "e723cc90-496f-47ef-9a40-753570996433",
  "reviewerSession": "agent:a0d7727848ba55fa6",
  "risk": "normal",
  "elapsedMinutes": 4.322116666666667,
  "timing": {
    "source": "runner",
    "durationMs": 259327,
    "evidence": "Claude Code Agent tool result for reviewer agent a0d7727848ba55fa6: duration_ms=259327."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the runbook with two minor notes, both fixed in the runbook: it now names the checklist as the target, with Lakina as the conforming desk, and scopes the three-viewer deployed check to private or cross-owner sources.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-14-20.07.10-write-infra-dashboard-runbook.md",
    ".agent/decisions.md",
    "docs/runbooks/hq-product-design.md",
    "src/ops-desk/README.md",
    "architecture.md",
    ".agent/worklog/MO-26-11-13-23.38.17.md"
  ],
  "findings": [
    {
      "id": "IDR-REF",
      "severity": "minor",
      "description": "The runbook called Darwin the reference although Darwin's deployment and Factory rows, Current-view detail and old fragments do not meet the checklist; Lakina does.",
      "paths": [
        "docs/runbooks/infra-dashboard-design.md"
      ],
      "disposition": "fixed",
      "response": "The introduction now names the checklist as the target, Lakina as meeting all of it, and says which Darwin parts predate it."
    },
    {
      "id": "IDR-VWR",
      "severity": "minor",
      "description": "The three-viewer deployed check read as required for every desk.",
      "paths": [
        "docs/runbooks/infra-dashboard-design.md"
      ],
      "disposition": "fixed",
      "response": "Scoped to desks that show a private or cross-owner source."
    }
  ]
}
```
