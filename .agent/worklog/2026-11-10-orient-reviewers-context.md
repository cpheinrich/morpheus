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

Independent normal-risk review cleared on one condition. REV-1 (substantive): the packet's Suggested context paths had no test; the author added exact assertions in tests/review.test.ts and confirmed a mutant listing a missing acceptance file fails. REV-2 (minor): an empty contextRead errored while an absent one warned; both now warn. The reviewer oriented through the context CLI because the MCP indexes the primary checkout, not task-worktree records. Three cleared follow-ups covered a trunk-merge budget trim, Chris's added test-plan rule, and minor wording and PR-body fixes (REV-3 to REV-5).

The review also showed a follow-up gap: the Context MCP refused a record that existed only in the task worktree, so a reviewer of a new record needs the CLI fallback.

```morpheus-review
{
  "version": 2,
  "base": "b9b804bb8ff339ff04fee9dd88bc133c0535820b",
  "reviewed": "20d26b71c8c85d99ca60504d7ccb94655c8c67fb",
  "covered": "51b98ac561a07b96d7a6ffa680f67ef67286e220",
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
  "summary": "Independent normal-risk review cleared on one condition. REV-1 (substantive): the packet's Suggested context paths had no test; the author added exact assertions in tests/review.test.ts and confirmed a mutant listing a missing acceptance file fails. REV-2 (minor): an empty contextRead errored while an absent one warned; both now warn. The reviewer oriented through the context CLI because the MCP indexes the primary checkout, not task-worktree records. Three cleared follow-ups covered a trunk-merge budget trim, Chris's added test-plan rule, and minor wording and PR-body fixes (REV-3 to REV-5).",
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
    },
    {
      "id": "REV-3",
      "turn": 2,
      "severity": "minor",
      "description": "After the budget trim, \"that packet\" in AGENTS.md no longer had an antecedent.",
      "paths": [
        "AGENTS.md"
      ],
      "disposition": "fixed",
      "response": "Changed to \"the packet\" at the same size (19,998 bytes)."
    },
    {
      "id": "REV-4",
      "turn": 3,
      "severity": "minor",
      "description": "The PR description's Summary and Test plan lagged the late commits and did not mention the test-plan rule.",
      "paths": [
        ".agent/worklog/2026-11-10-orient-reviewers-context.md"
      ],
      "disposition": "fixed",
      "response": "Updated the PR body (no commit): a Summary bullet for the rule and Test plan lines for both late commits; the reviewer confirmed it at 51b98ac5."
    },
    {
      "id": "REV-5",
      "turn": 3,
      "severity": "minor",
      "description": "The contextRead warning sentence ended up inside the new Test-plan paragraph of the runbook.",
      "paths": [
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "fixed",
      "response": "Moved it back to the contextRead paragraph and noted that an empty list also warns."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code-subagent/aead01fda5de0ab87",
      "commit": "222ca3f4a822d8246510cfdbc14ad17395ca5d26",
      "outcome": "cleared",
      "elapsedMinutes": 0.3662,
      "timing": {
        "source": "runner",
        "durationMs": 21972,
        "evidence": "Agent tool result for resumed subagent aead01fda5de0ab87, follow-up 1: duration_ms=21972."
      },
      "scopeReason": "Late CI correction: after an exact trunk merge (e9fb9632, #689 grew AGENTS.md) the merged file was 20,020 bytes against the 20,000 budget; trimmed one phrase.",
      "summary": "Cleared the AGENTS.md trim and confirmed the trunk merge is exact; raised minor REV-3."
    },
    {
      "reviewerSession": "claude-code-subagent/aead01fda5de0ab87",
      "commit": "b4d33602e148fe7da22a5dd99bfd107fb42c7892",
      "outcome": "cleared",
      "elapsedMinutes": 1.30215,
      "timing": {
        "source": "runner",
        "durationMs": 78129,
        "evidence": "Agent tool result for resumed subagent aead01fda5de0ab87, follow-up 2: duration_ms=78129."
      },
      "scopeReason": "Chris added during review that reviewers read and extend the author's PR test plan; it amends the same reviewer contract and orientation step this PR changes, so it is inseparable from this ticket. Also fixes REV-3.",
      "summary": "Cleared the test-plan rule and REV-3; raised minor REV-4 and REV-5."
    },
    {
      "reviewerSession": "claude-code-subagent/aead01fda5de0ab87",
      "commit": "51b98ac561a07b96d7a6ffa680f67ef67286e220",
      "outcome": "cleared",
      "elapsedMinutes": 2.07705,
      "timing": {
        "source": "runner",
        "durationMs": 124623,
        "evidence": "Agent tool result for resumed subagent aead01fda5de0ab87, follow-up 3: duration_ms=124623."
      },
      "scopeReason": "Late correction for minor REV-5 (runbook paragraph) and confirmation of the REV-4 PR body update.",
      "summary": "Cleared REV-5 and REV-4; no remaining findings."
    }
  ]
}
```
