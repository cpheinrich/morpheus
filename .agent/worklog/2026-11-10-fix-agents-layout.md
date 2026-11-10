---
agent: claude
date: 2026-11-10
roadmap: MO-26-11-10-02.18.23
outcome: review
tags: [engineering, agent-instructions]
---

# Correct stale AGENTS.md layout facts

Chris asked for corrections where `AGENTS.md` is stale or inconsistent, keeping its spirit. I
checked every path, command and symbol the file names against the repository. All of them exist.
Two facts were wrong:

- "This `kind: internal` repo has only `hq/product/` under `hq/`" contradicts the layout table's
  own `hq/team/` rows, and `hq/onboarding.md` also exists. It now lists all three.
- The layout table had no row for `plugins/`, where the optional Factory delegation plugin lives.
  The row says it is never scaffolded, as the 2026-11-02 decision requires.

To stay inside the 20,000-byte budget I removed one "Things that have bitten us" bullet ("Quote
frontmatter titles containing colons; `pm new` does this automatically"). The same fact is in
`learned.md`, and `pm new` handles it. I also changed one em dash to a comma. The file is now
19,999 bytes, so the next addition will need a cut.

## Test plan record

- `pnpm exec vitest run tests/agent-instructions.test.ts tests/doctor-instructions.test.ts`:
  24 passed. They cover the size budget, runbook links and doctor anchors.
