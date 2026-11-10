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

## Independent review

Cleared. Every new statement checks out against the tree and the 2026-11-02 Factory decision, and the removed bullet's fact survives in learned.md and in pm new's behaviour. One minor note, a source comment that pointed at the removed bullet, was fixed in its own commit.

```morpheus-review
{
  "version": 2,
  "base": "b9b804bb8ff339ff04fee9dd88bc133c0535820b",
  "reviewed": "11406dec9acee24b072538666cc6058018501636",
  "covered": "52e0707627ed198ee2737bddd5005e9a3075636c",
  "authorSession": "a4abd6f6-9287-5ce5-be3c-1e632b6f9d49",
  "reviewerSession": "a36d0ac46f78224d1",
  "risk": "small",
  "elapsedMinutes": 0.8676666666666667,
  "timing": {
    "source": "runner",
    "durationMs": 52060,
    "evidence": "Claude Code task-notification for subagent a36d0ac46f78224d1: duration_ms=52060."
  },
  "outcome": "complete",
  "summary": "Cleared. Every new statement checks out against the tree and the 2026-11-02 Factory decision, and the removed bullet's fact survives in learned.md and in pm new's behaviour. One minor note, a source comment that pointed at the removed bullet, was fixed in its own commit.",
  "findings": [
    {
      "id": "MOA-1",
      "severity": "minor",
      "description": "A comment in src/pm/new-item.ts called the unquoted-colon case 'the first entry under things that have bitten us', which this PR removes (and which was already not first).",
      "paths": [
        "src/pm/new-item.ts",
        "dist/pm/new-item.js",
        "dist/pm/new-item.js.map"
      ],
      "disposition": "fixed",
      "response": "The comment now points at .agent/learned.md; dist recompiled."
    },
    {
      "id": "MOA-2",
      "severity": "incidental",
      "description": "AGENTS.md sits at 19,999 of 20,000 bytes, so the next addition must include a cut.",
      "paths": [
        "AGENTS.md"
      ],
      "disposition": "open",
      "response": "Recorded in the worklog; no change needed now.",
      "roadmap": "MO-26-11-10-02.18.23"
    }
  ]
}
```
