---
date: 2026-11-15
roadmap: MO-26-11-15-01.45.04
tags: [engineering, devops, design, factory]
summary: Project safe Factory task names, summaries and GitHub evidence for Infra Work.
---

The shared desk package now renders an explicit title and summary, with a repository-based
fallback for legacy tasks and validated PR/commit links. Fleet stores the separately supplied
display field, keeps only exact PR references from structured worker evidence, and serves a
single enrolled project's active and recent task metadata to a read-only viewer. No private
brief, message, result summary, or artifact path crosses that boundary. Existing controller
status/wait remains the place for private results; there is no Fleet browser log link.

The existing Zod, Firestore and GitHub link primitives cover this domain. No new package or
scheduler is needed. The recent query needs a composite index; verification in the emulator
is not evidence that the deployed index exists. See the
[Infra desk design](../../docs/runbooks/infra-dashboard-design.md) and
[Factory viewer contract](../../plugins/factory/README.md#read-factory-work-in-an-infra-desk).

Focused checks: Ops Desk Vitest (18), Factory Node tests (24), the real Fleet API with the
Firestore emulator (2), TypeScript, compile, complexity and PM indexing. The emulator test
exercises unauthorized roles, cross-project data, the private document rules and completed
work with PR evidence. All data and examples are synthetic.

The initial independent review reproduced three problems. The follow-up keeps held tasks as
Unknown (and dates expired contact), sorts before the limit, and lets a terminal result win
across concurrent live/history reads. PR evidence must match the finish schema before it
enters the journal; overlong evidence is declined without truncating a URL into another
destination. The runner, direct overlap fixture and Firebase emulator exercise these cases.

Independent review blocked the initial change on work with expired contact, unsafe PR evidence
that could poison a runner's finish journal, and duplicate/incorrect ordering in the scoped
snapshot. The second turn cleared the implementation. Both requested fixture corrections
passed: the cancellation fixture now has a fresh attempt and the evidence fixture places
the exact PR URL at the cutoff before a forbidden suffix.

```morpheus-review
{
  "version": 2,
  "base": "78eacb1848bb549349c5c1c0e29eb05edd31f511",
  "reviewed": "71612fa67cd6a77389ac1b09ac771f9ffe7ffca6",
  "covered": "ef9ebe57fb4b1668c78a17f745a8ee8e241b11bf",
  "authorSession": "01a1de94-1d76-7340-9b4f-99ce13e8ac1f",
  "reviewerSession": "/root/review_shared",
  "risk": "high",
  "elapsedMinutes": 3.7666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 226000,
    "evidence": "Author UTC clock at dispatch 09:54:06 and observed completed turn 09:57:52."
  },
  "outcome": "complete",
  "summary": "The second review cleared the work after it retained unresolved task evidence, validated optional PR evidence before settlement and deduplicated finished work. Both exact test-only conditions passed.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-15-01.45.04-describe-factory-work.md",
    "docs/runbooks/infra-dashboard-design.md",
    ".agent/decisions.md",
    "hq/product/roadmap/MO-26-11-06-15.15.12-report-infrastructure-status.md",
    ".agent/worklog/2026-11-15-describe-factory-work.md",
    ".agent/worklog/2026-11-06-report-infrastructure-status.md",
    "architecture.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/hq-product-design.md",
    "docs/runbooks/device-bootstrap.md",
    "docs/runbooks/independent-review.md"
  ],
  "findings": [
    {
      "id": "FW-1",
      "severity": "substantive",
      "description": "Expired and otherwise indeterminate Factory work could disappear or be shown as waiting.",
      "paths": ["plugins/factory/src/fleet-work.mjs"],
      "disposition": "fixed",
      "response": "Return Unknown for expired, cancellation-pending and cleanup-unverified rows, with the expired contact time when known.",
      "condition": {
        "paths": ["tests/factory-fleet-firestore.test.mjs"],
        "evidence": "Seed a working task with a fresh attempt and pending cancellation; assert Unknown with no expired contact, and rerun the emulator."
      },
      "conditionMet": "The exact test-only amendment passed both tests in the Firebase Fleet emulator suite."
    },
    {
      "id": "FW-2",
      "severity": "substantive",
      "description": "A malformed or truncated PR reference could poison the runner's durable settlement or link to a different destination.",
      "paths": ["plugins/factory/src/fleet-display.mjs", "plugins/factory/src/fleet-runner.mjs"],
      "disposition": "fixed",
      "response": "Use the finish wire schema on each reference and decline overlong strings without changing their URL boundaries.",
      "condition": {
        "paths": ["plugins/factory/tests/fleet-runner.test.mjs"],
        "evidence": "End the valid URL exactly at character 2,000 before appending /files. Assert settlement contains only PR 42 and rerun the focused runner suite."
      },
      "conditionMet": "The exact test-only amendment passed all 12 focused runner tests."
    },
    {
      "id": "FW-3",
      "severity": "substantive",
      "description": "Concurrent reads could return both running and completed rows for one task, and the live limit preceded time ordering.",
      "paths": ["plugins/factory/src/fleet-work.mjs"],
      "disposition": "fixed",
      "response": "Order each query before limiting it and prefer the settled row for an overlapping task ID. The reviewer verified both regressions."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_shared",
      "commit": "6a3497c205cfdd47baac7d8ab48e7af4ea60b6bc",
      "outcome": "cleared",
      "elapsedMinutes": 1.5333333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 92000,
        "evidence": "Author UTC clock at follow-up dispatch 10:01:30 and observed cleared turn 10:03:02."
      },
      "summary": "All three implementation findings cleared. The two narrow fixture corrections were required and passed."
    }
  ]
}
```
