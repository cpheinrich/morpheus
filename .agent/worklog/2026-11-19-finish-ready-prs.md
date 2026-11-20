---
roadmap: MO-26-11-19-20.51.59
tags: [engineering, devops]
---

# Move completed PRs through merge

Aligned the repository instructions, scaffold, PR template and runbooks on the
draft-to-ready command, author ownership through required CI and authorized merge,
and the Open questions record for substantive blockers and explicitly requested holds.

The first scaffold wording exceeded the existing startup budget. Shortened the
scaffold text and reran the instruction, init and doctor suites.

## Independent review

Independent review found that GitHub Manager can promote a finished plain draft during an explicit timed hold and that the generated PR template still used the old instructions. The correction documents the existing WIP title guard, aligns both templates, and verifies the generated output and size budgets. The reviewer condition was satisfied with focused tests and generated artifact checks.

```morpheus-review
{
  "version": 2,
  "base": "7b36a177f34e872a12c6387c2ccde8096aa1c016",
  "reviewed": "986515a208508d9299a1ec4cbcf597b540a63f51",
  "covered": "076f160fc9cc277503ca48119b310b338e24f7a1",
  "authorSession": "01a1f739-c016-7270-8f8a-4e4de50cb6d6",
  "reviewerSession": "/root/morpheus_ready_review",
  "risk": "normal",
  "elapsedMinutes": 2.933333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 176000,
    "evidence": "Reviewer’s observed UTC clocks, 2026-11-20 04:57:07 to 05:00:03, reported with its completed review."
  },
  "outcome": "complete",
  "summary": "Independent review found that GitHub Manager can promote a finished plain draft during an explicit timed hold and that the generated PR template still used the old instructions. The correction documents the existing WIP title guard, aligns both templates, and verifies the generated output and size budgets. The reviewer condition was satisfied with focused tests and generated artifact checks.",
  "contextRead": [
    "AGENTS.md",
    ".agent/decisions.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/pm-workflow.md",
    "docs/runbooks/gh-manager.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-19-20.51.59-finish-ready-prs.md",
    "hq/product/roadmap/MO-26-10-20-17.24.49-triage-draft-prs.md",
    ".agent/worklog/MO-26-11-09-13.10.13.md",
    ".agent/worklog/2026-10-12-protect-wip-prs.md",
    ".agent/worklog/2026-10-20-triage-draft-prs.md",
    ".agent/worklog/2026-11-19-finish-ready-prs.md"
  ],
  "findings": [
    {
      "id": "MOR-R1",
      "severity": "substantive",
      "description": "Draft triage can promote finished work with a time-bound explicit hold unless the title carries the existing WIP guard. The generated PR template also retains the previous draft-only guidance.",
      "paths": [
        "AGENTS.md",
        ".github/pull_request_template.md",
        "docs/runbooks/pm-workflow.md",
        "src/init/templates.ts",
        "dist/init/templates.js",
        "dist/init/templates.js.map",
        "tests/init.test.ts"
      ],
      "disposition": "fixed",
      "response": "The merge runbook explains the existing WIP title guard and clearance. Author instructions and both PR templates surface it. A generated-template check pins both promotion and hold instructions.",
      "condition": {
        "paths": [
          "AGENTS.md",
          ".github/pull_request_template.md",
          "docs/runbooks/pm-workflow.md",
          "src/init/templates.ts",
          "dist/init/templates.js",
          "dist/init/templates.js.map",
          "tests/init.test.ts"
        ],
        "evidence": "Only update the named files. Reuse the existing WIP title for explicit holds in Manager-managed repositories, name the requester and clearance in Open questions, align both PR templates, and verify the rendered guidance and startup budgets. Run focused instruction/init/doctor and triage-apply tests, typecheck, compile and whitespace check."
      },
      "conditionMet": "076f160fc9cc277503ca48119b310b338e24f7a1 changes only the seven cleared paths. 107 focused tests including the rendered template checks and 13 triage apply tests passed. Typecheck, compile, index and whitespace checks passed. Rendered AGENTS is 15,946 bytes and repository AGENTS is 19,818 bytes, both within budget."
    }
  ]
}
```
