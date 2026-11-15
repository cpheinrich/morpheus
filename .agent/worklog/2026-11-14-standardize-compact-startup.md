---
date: 2026-11-14
agent: codex
roadmap: MO-26-11-14-20.37.36
tags: [engineering, agent-workflow]
summary: "Adopt Evo's compact startup in Morpheus and new projects."
---

Morpheus and new scaffolds now declare a small startup core using the existing
manifest. The scaffold test resolves both compact and fallback policies through
the real reader. Existing projects adopt the same configuration through their
own reviewed changes.

The author verified the old four-record receipt in a desktop session before
claiming this change. The independent design critique identified Lakina's
explicit mandatory record and operational validators that read decision files.
Address those in Lakina's rollout while preserving pinned evidence.

Verification: typecheck, compilation, PM index, complexity enforcement, and
120 tests across init, rollout policy, task lookup, MCP and session start.

A fresh Codex app-server session discovered the checkout's actual Context MCP,
found the rollout item, and opened exact source lines. It verified lookup. The
focused task-context suite exercised recorded reading and the separate task gate.

Independent review cleared compact project startup after fixing receipt recovery, the scaffold policy tests and the PM runbook. The three follow-up suites passed 141 tests. Typecheck, lint,
and compiled output verification passed again after the correction.

Required Node CI found two existing startup guidance assertions. The correction restores
their read-once and disk evidence wording. The reviewer independently cleared the 20 tests and
generated mirror.

```morpheus-review
{
  "version": 2,
  "base": "5b29ff982b704a720ddec2f27f934a53ba073e7d",
  "reviewed": "f802391741e2c85340ef0a9b0ea2e6175cea268a",
  "covered": "8741d1ade379589b93feca9797aa72f6434a5467",
  "authorSession": "01a1dc33-4d68-7693-bdbf-f4420f795216",
  "reviewerSession": "/root/morpheus_startup_review",
  "risk": "normal",
  "elapsedMinutes": 2.9166666666666665,
  "timing": {
    "source": "clock",
    "durationMs": 175000,
    "evidence": "Controller clock from reviewer invocation 2026-11-15 04:42:00 UTC to received verdict 2026-11-15 04:44:55 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review cleared compact project startup after fixing receipt recovery, the scaffold policy tests and the PM runbook.",
  "contextRead": [
    "AGENTS.md",
    "architecture.md",
    ".agent/README.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "docs/runbooks/context-search.md",
    "docs/runbooks/context-freshness.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/pm-workflow.md",
    "docs/runbooks/test-quality.md",
    ".agent/worklog/2026-11-07-context-search-rollout.md",
    ".agent/worklog/2026-11-14-standardize-compact-startup.md",
    "hq/product/roadmap/MO-26-11-14-20.37.36-standardize-compact-startup.md"
  ],
  "findings": [
    {
      "id": "STARTUP-01",
      "severity": "substantive",
      "description": "A no-receipt refusal still told compact sessions to reread both full logs.",
      "paths": [
        "src/session/gate.ts"
      ],
      "disposition": "fixed",
      "response": "Point to the active startup brief and assert the recovery cue for a compact session."
    },
    {
      "id": "STARTUP-02",
      "severity": "substantive",
      "description": "The all-kind scaffold test expected the inbox in the required records even under the new policy.",
      "paths": [
        "tests/session-gate.test.ts"
      ],
      "disposition": "fixed",
      "response": "Pin each kind's compact and full canonical inputs, and independently check that the inbox is created."
    },
    {
      "id": "STARTUP-03",
      "severity": "substantive",
      "description": "The PM runbook still told fresh sessions to read both canonical logs.",
      "paths": [
        "docs/runbooks/pm-workflow.md"
      ],
      "disposition": "fixed",
      "response": "Direct startup to the brief and task records to Context search."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_startup_review",
      "commit": "5fddcebdc0ba2905283b4048df31820a0bd4a437",
      "outcome": "cleared",
      "elapsedMinutes": 0.8833333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 53000,
        "evidence": "Controller clock from reviewer invocation 2026-11-15 04:46:15 UTC to received verdict 2026-11-15 04:47:08 UTC."
      },
      "summary": "All three findings cleared on the corrected commit. The reviewer reran 141 focused tests successfully."
    },
    {
      "reviewerSession": "/root/morpheus_startup_review",
      "commit": "8741d1ade379589b93feca9797aa72f6434a5467",
      "outcome": "cleared",
      "elapsedMinutes": 1.25,
      "timing": {
        "source": "clock",
        "durationMs": 75000,
        "evidence": "Controller clock from invocation 2026-11-15 04:54:40 UTC to received verdict 2026-11-15 04:55:55 UTC."
      },
      "scopeReason": "Required Node CI on the already reviewed branch caught two existing instruction guard assertions. Review this correction and generated mirror only.",
      "summary": "The required read-once and disk read evidence cues are explicit again. The 20 instruction tests pass and the generated mirror matches."
    }
  ]
}
```
