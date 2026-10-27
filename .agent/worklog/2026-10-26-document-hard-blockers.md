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

## Independent review

Independent review cleared the CTO and DevOps blocker-record and explicit spending-policy guidance without findings; four incident scenarios preserved recovery, credential and budget boundaries.

The reviewer independently ran 41skill tests, compared all 14 canonical/Claude files against the compiled module, checked compiled reference routes and inspected the complete diff. The four forward evaluations proposed continued diagnosis and supported fresh-build recovery for the generic upload error; controller policy repair for obsolete internal holds; a scoped signing credential request with independent tests continuing when no authorized signing route remained; and an explicit increase request only when verified spend left insufficient funds. These are scenario judgments, not additional live provider actions. No findings or conditions.

```morpheus-review
{
  "version": 2,
  "base": "9a2433aef3fdf39099b07baae347613a17f58b10",
  "reviewed": "15b7bdc7c05f1d830d92611319ebd4b3658fa7ed",
  "covered": "15b7bdc7c05f1d830d92611319ebd4b3658fa7ed",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/hard_blocker_skill_review_20261026",
  "risk": "high",
  "elapsedMinutes": 2.5,
  "timing": {
    "source": "clock",
    "durationMs": 150000,
    "evidence": "Root clock at invocation2026-10-26T22:44:11Z and completion observed2026-10-26T22:46:41Z for /root/hard_blocker_skill_review_20261026; final reviewer report also records near-completion clock22:46:01Z. No workload estimate or artificial wait."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the CTO and DevOps blocker-record and explicit spending-policy guidance without findings; four incident scenarios preserved recovery, credential and budget boundaries.",
  "findings": []
}
```
