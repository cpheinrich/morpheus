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
