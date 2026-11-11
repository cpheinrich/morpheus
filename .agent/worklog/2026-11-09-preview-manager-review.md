---
date: 2026-11-09
roadmap: MO-26-11-09-15.20.21
tags: [engineering, devops]
---

# Preview GitHub Manager review validation

Issue #444 described a correct review that escalated because the apply step was the first place to see a formatting mismatch. The Manager brief now gives its session a local preflight using the same validator, committed head, base ref and proposed body. The session can correct its visible summary before pushing and submitting a decision. Apply still verifies the live head and all policy.

The real Git fixture rejects the mismatched paragraph, accepts the corrected committed worklog, and prints the checked head. Both focused suites passed all 116 tests. Typecheck, compile, PM index and enforced complexity passed.

Independent review cleared the Manager preflight with two minor wording notes. The command now reports a passed preflight without asserting that an exempt record was read, and the runbook describes its local effects precisely. All 116 focused tests and the compile and complexity checks passed after those edits.

```morpheus-review
{
  "version": 2,
  "base": "7526ccd1bf6576ca4ee2d4227bff768d130011f7",
  "reviewed": "cf06454c25d4e150974be1b5f76010cc125197bb",
  "covered": "afed4d32ac474aefabad25fcc8f0a4b39b62e095",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_manager_preflight",
  "risk": "normal",
  "elapsedMinutes": 0.8739666666666667,
  "timing": {
    "source": "runner",
    "durationMs": 52438,
    "evidence": "Parent Codex transcript recorded the fresh reviewer dispatch at 2026-11-09T23:24:30.903Z and the final verdict at 2026-11-09T23:25:23.341Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the Manager preflight with two minor wording notes. The command now reports a passed preflight without asserting that an exempt record was read, and the runbook describes its local effects precisely. All 116 focused tests and the compile and complexity checks passed after those edits.",
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "The success message claims a record was validated even when project policy exempts it from being read.",
      "paths": [
        "src/cli/gh-manager.ts",
        "dist/cli/gh-manager.js",
        "dist/cli/gh-manager.js.map"
      ],
      "disposition": "fixed",
      "response": "The message reports the preflight passed at the named revisions. Recompiled its generated JavaScript."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "The runbook says the command only reads Git although local merge replay can write unreachable Git objects.",
      "paths": [
        "docs/runbooks/gh-manager.md"
      ],
      "disposition": "fixed",
      "response": "Document that the local check leaves the working tree, refs and GitHub untouched."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "a408b9fd8d8ef9888df94490fb7979af00a18b79",
      "reason": "Integrated #680 and #683. Git merged the CLI TypeScript sources automatically. Regenerated the conflicted dispatch/help source maps and help declaration using the integrated TypeScript. Manager, review-record and CLI dispatch tests, typecheck, compile, PM index and diff checks passed."
    }
  ]
}
```
