---
agent: codex
date: 2026-10-12
roadmap: MO-26-10-12-09.17.58
outcome: review
---

# Replace vulnerable frontmatter dependency

The weekly audit traced the production advisory to the abandoned `gray-matter` package's
`js-yaml` 3 dependency. Replaced it with the API-compatible, Eleventy-maintained
`@11ty/gray-matter` fork, which uses current `js-yaml`. The four frontmatter consumers compile and
their 143 focused tests pass; `pnpm audit --prod` now reports no known vulnerabilities.

The package choice and rejected custom-parser alternative are recorded in
`.agent/decisions.md`. No behavior or schema change is intended.

## Independent review

Independent review cleared the normal-risk dependency replacement with no substantive findings. It corroborated the clean production audit, dependency graph, generated output, focused tests, packaged CLI, and governance state. One minor stale YAML-date explanation was corrected across policy, architecture, source comments, tests, and generated output; codebase-memory was unavailable.

```morpheus-review
{
  "version": 2,
  "base": "f063880c0002819d9be85901cd0b714c1afbbea5",
  "reviewed": "047ba0b7e167e3af58f378d5655f7d12ce33cec2",
  "covered": "aa4e006fb77654e0ed023833f0a84a87376cf0aa",
  "authorSession": "01a130d8-449a-7330-93fa-0f0fae6d9f8b",
  "reviewerSession": "/root/review_morpheus_376",
  "risk": "normal",
  "elapsedMinutes": 6.025833333333333,
  "timing": {
    "source": "clock",
    "durationMs": 361550,
    "evidence": "Measured from reviewer dispatch at 2026-10-12T16:41:50.559Z to final response receipt at 2026-10-12T16:47:52.109Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the normal-risk dependency replacement with no substantive findings. It corroborated the clean production audit, dependency graph, generated output, focused tests, packaged CLI, and governance state. One minor stale YAML-date explanation was corrected across policy, architecture, source comments, tests, and generated output; codebase-memory was unavailable.",
  "findings": [
    {
      "id": "GM-01",
      "severity": "minor",
      "description": "Documentation described current YAML parsing as producing Date objects although the new parser returns strings.",
      "paths": [
        "AGENTS.md",
        "architecture.md",
        "src/pm/schema.ts",
        "tests/team.test.ts",
        "dist/pm/schema.js",
        "dist/pm/schema.d.ts"
      ],
      "disposition": "fixed",
      "response": "Reframed Date handling as backward compatibility, regenerated committed output, and passed 95 focused tests, typecheck, compile, and diff validation."
    }
  ]
}
```
