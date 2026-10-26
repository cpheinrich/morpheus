---
roadmap: MO-26-10-26-15.37.42
tags: [engineering, devops, agents]
---

# Document hard blockers before escalation

Chris required the session and the shared DevOps persona to record what a blocker was, why it
was hard, and what reasonable alternatives had been tried with their outcomes. He also explicitly
removed this delivery campaign's internal budget holds, asking the agent to spend the existing
budget as needed and notify him if it ran out. Neither direction removes source review, CI,
credential boundaries or the requirement to preserve uncertain upload identities.

The change extends existing skill instructions and incident records. A hard blocker now needs
evidence and exhausted reasonable authorized options; an unresolved diagnosis stays active work.
The CTO budget reference distinguishes its default reservation policy from an explicitly chosen
engagement policy. No new script, scheduler, budget grant protocol or dependency is needed.

## Validation plan

Run the existing skill distribution/link/CLI/scaffold tests, skill frontmatter validators,
typecheck, compile and PM index. No full local suite is justified by these prose and generated
guide changes. Independent review also evaluates four incident scenarios against the final skill
without the author's intended answers. Actual results and review evidence follow below.

## Validation results

- `pnpm exec vitest run tests/agentic-cto-skill.test.ts`: 41 passed. The existing suite checks
  canonical/mirror bytes, reference links, generated CLI entrypoints and scaffold distribution.
- `pnpm typecheck` and `pnpm compile`: passed.
- `pnpm morpheus pm index`: passed; generated indexes unchanged.
- Both skills passed the skill-creator `quick_validate.py`. System and bundled Python lacked
  PyYAML; rather than treating the missing validator dependency as a hard blocker, used
  `uv run --no-project --with PyYAML --python python3` in an isolated tool environment. No repository
  dependency changed. This is a validation-environment repair, not a provider action.

No new wording-matching test was added: it would assert prose exists without showing that an
agent makes the right decision. Independent review instead evaluates concrete incident scenarios
alongside the existing distribution regressions. No local full-suite run; CI owns integration.
