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
