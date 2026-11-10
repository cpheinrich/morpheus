---
date: 2026-11-10
roadmap: MO-26-11-10-02.18.11
tags: [engineering, devops]
summary: "Reviewers orient with the context MCP on records the author names in the packet."
---

# Reviewers orient with the context MCP

In the evo#863 test, the Evo author found the decisive earlier roadmap item through the Context
MCP: a retry already existed, so the real bug was the transient-error check. Its independent
reviewer read only code and Firebase SDK source and no project records. Chris asked that reviewers
always orient with the MCP first, and that authors in every Morpheus project suggest what to read.

- The reviewer contract (`src/review/local-prompt.ts`) makes orientation the first step: an overview
  if the project is new to the reviewer, a search for the ticket's subject and the changed area, and
  a cited read of every Suggested context path. The response lists **Context read**.
- `morpheus review prepare` prints **Suggested context**: the roadmap item and its acceptance file,
  then an `AUTHOR:` line the author replaces with the governing decisions, runbooks, worklogs or
  meeting notes. The packet ships in the CLI, so every project's authors see it on their next update.
- The record gains optional `contextRead`. Without it `review validate` and `check pr` print a
  `review-context` warning. It is never refused, so older records stay valid. The CD repair verifier
  treated every non-waiver finding as a refusal, so it now ignores warnings too.
- AGENTS.md, the scaffold template and the independent-review runbook name the author step. Both
  instruction files were at their size budgets, so the existing sentence was reworded, not extended.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index`; `morpheus complexity check`
  passes with no advisories.
- `pnpm exec vitest run tests/local-review.test.ts tests/agent-instructions.test.ts tests/review.test.ts
  tests/cd/native-worker.test.ts tests/cd/repair-checks.test.ts tests/gh-manager tests/init.test.ts
  tests/doctor-instructions.test.ts tests/doctor.test.ts`: all passed. New assertions cover the
  warning (exact finding), acceptance of a record with `contextRead`, refusal of an empty list and an
  absolute path, the template field and the packet section. The CD repair fixtures carry no
  `contextRead`, so they exercise the warning filter.
- One full `pnpm test` (touches `src/review/`): 153 files, 4,342 tests passed.

## Independent review

Independent normal-risk review cleared on one condition. REV-1 (substantive): the packet's Suggested context paths had no test; the author added exact assertions in tests/review.test.ts and confirmed a mutant listing a missing acceptance file fails. REV-2 (minor): an empty contextRead errored while an absent one warned; both now warn. The reviewer oriented through the context CLI because the MCP indexes the primary checkout, not task-worktree records.

The review also showed a follow-up gap: the Context MCP refused a record that existed only in the task worktree, so a reviewer of a new record needs the CLI fallback.

```morpheus-review
{
  "version": 2,
  "base": "b9b804bb8ff339ff04fee9dd88bc133c0535820b",
  "reviewed": "20d26b71c8c85d99ca60504d7ccb94655c8c67fb",
  "covered": "d4fe0bf9a874d1ad3bd052c921d129de3f361ae9",
  "authorSession": "7aa855bb-6d4e-558c-a862-36a1b9e57423",
  "reviewerSession": "claude-code-subagent/aead01fda5de0ab87",
  "risk": "normal",
  "elapsedMinutes": 1.2466333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 74798,
    "evidence": "Agent tool result for subagent aead01fda5de0ab87: duration_ms=74798."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review cleared on one condition. REV-1 (substantive): the packet's Suggested context paths had no test; the author added exact assertions in tests/review.test.ts and confirmed a mutant listing a missing acceptance file fails. REV-2 (minor): an empty contextRead errored while an absent one warned; both now warn. The reviewer oriented through the context CLI because the MCP indexes the primary checkout, not task-worktree records.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-10-02.18.11-orient-reviewers-context.md",
    ".agent/decisions.md",
    "docs/runbooks/independent-review.md",
    ".agent/worklog/2026-11-09-use-context-in-reviews.md",
    ".agent/worklog/2026-11-10-orient-reviewers-context.md"
  ],
  "findings": [
    {
      "id": "REV-1",
      "severity": "substantive",
      "description": "The Suggested context records loadReviewContext builds (item path, then an existing acceptance file) had no test.",
      "paths": [
        "src/review/context.ts",
        "tests/review.test.ts"
      ],
      "disposition": "fixed",
      "response": "Added exact assertions for the item-only, item-plus-acceptance and missing-acceptance cases.",
      "condition": {
        "paths": [
          "tests/review.test.ts"
        ],
        "evidence": "pnpm exec vitest run tests/review.test.ts passes; flipping records!.push(rel) to unconditional makes the missing-acceptance assertion fail, then revert."
      },
      "conditionMet": "pnpm exec vitest run tests/review.test.ts: 80 passed. With records!.push(rel) unconditional, 'flags a declared acceptance file that is not there' failed (1 failed, 79 passed); reverted and 80 passed again."
    },
    {
      "id": "REV-2",
      "severity": "minor",
      "description": "An empty contextRead failed validation while an absent one only warned.",
      "paths": [
        "src/review/local.ts",
        "tests/local-review.test.ts",
        "dist/review/local.js",
        "dist/review/local.js.map"
      ],
      "disposition": "fixed",
      "response": "Dropped the minimum length; an empty list now gives the same review-context warning, asserted exactly."
    }
  ]
}
```
