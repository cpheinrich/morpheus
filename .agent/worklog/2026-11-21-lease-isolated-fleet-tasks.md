---
tags: [engineering, devops, factory]
---

Expanded the Studio worker enrollment alongside an existing runner without changing its two Tart lanes. Three separate execution accounts passed exact checkout validation and reported both provider quotas on a zero-traffic service revision.

A Fleet implementation session on the MacBook Pro returned a verified private patch against the published claim. The patch adds a project setting for isolated single-repository Git tasks. Firestore keeps using the existing slot and workspace lease transactions. Stable retries preserve the original task and compare its exact execution intent.

The first complexity check flagged the launch resolver above the repository limit. I moved the workspace eligibility check into a named helper and reran the focused tests. The existing controller dispatcher still produces a cognitive-complexity advisory. Production exposure remains conditional on protected delivery and four overlapping worker receipts.

## Independent review

The independent Claude Fleet reviewer cleared the published candidate after tracing authorization, stable retries, provider queues, slot ownership and verified settlement. I clarified the README and reused one workspace eligibility rule at service startup and API admission. The reviewer verified the diff and source syntax. The controller reran all 62 focused tests and separately passed the two Firestore emulator tests.

```morpheus-review
{
  "version": 2,
  "base": "1170c92160f1609fb55f3c5c441ddb4ea1127aad",
  "reviewed": "69c2eaef10dd1a5e0346c52bfad2648c746a151e",
  "covered": "a1bd840efed2d83616b7e2740d10e302d3efb1a7",
  "authorSession": "01a1edd7-8c88-7a62-a255-cbc13c753532",
  "reviewerSession": "40d7cf01-4d82-4cc7-aec4-0afd92d37edb",
  "risk": "high",
  "elapsedMinutes": 2.9457166666666668,
  "timing": {
    "source": "runner",
    "durationMs": 176743,
    "evidence": "Fleet run 2b67ad6d-ce70-4ac0-9ef2-db822de0211f, admission dedd4dd0-0b1a-425f-9b43-c9b1373417d8, with verified launch and termination. Verdict SHA-256 15aee5842bb159933582d857afdc472544755feee80c9f852d3ff35d69ae1a95."
  },
  "outcome": "complete",
  "summary": "The independent Claude Fleet reviewer cleared the published candidate after tracing authorization, stable retries, provider queues, slot ownership and verified settlement. I clarified the README and reused one workspace eligibility rule at service startup and API admission. The reviewer verified the diff and source syntax. The controller reran all 62 focused tests and separately passed the two Firestore emulator tests.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-21-01.02.57-lease-isolated-fleet-tasks.md",
    ".agent/worklog/2026-11-21-lease-isolated-fleet-tasks.md",
    "architecture.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "FLEET-R1",
      "severity": "minor",
      "description": "The README used workspace policy to refer to the workspaceLease setting, which could mislead operators about retry behavior for related repositories.",
      "paths": [
        "plugins/factory/README.md"
      ],
      "disposition": "fixed",
      "response": "Named the workspaceLease setting explicitly. The subsequent sentence retains rejection when related workspace enrollment changes."
    },
    {
      "id": "FLEET-R2",
      "severity": "minor",
      "description": "Service startup and API admission duplicated the single-repository workspace lease rule.",
      "paths": [
        "plugins/factory/scripts/fleet-service.mjs",
        "plugins/factory/src/fleet-api.mjs"
      ],
      "disposition": "fixed",
      "response": "Both boundaries use the same predicate and error text. The existing API tests exercise the predicate across valid and invalid enrollments."
    }
  ]
}
```
