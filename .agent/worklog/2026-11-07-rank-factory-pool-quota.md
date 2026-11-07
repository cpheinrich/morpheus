---
roadmap: MO-26-11-07-07.58.53
tags: [engineering, devops]
---
# Rank Factory subscription pools by available quota

The sub2api Simple Mode scheduler already handles sticky sessions, account load
and failover. Factory reads the existing admin inventory and usage APIs and ranks
worker providers by the roomiest eligible account. No dependency or second account
scheduler is needed. A provider's worker continues to use the shared gateway key.
A pinned task rechecks the pool score. Standard explicit model IDs constrain the
provider before route selection.

Focused regression tests cover an exhausted first account, a transient usage
failure, a usable account on the second page, disabled or ineligible accounts,
the routing cutoff and model conflicts with an existing pin.

Independent review found two eligibility gaps and a first-run routing test gap. The follow-up confirmed the exact expiry boundary, OpenAI subscription plan filtering and explicit GPT routing from an unpinned task. All 25 focused tests passed on the correction.

```morpheus-review
{
  "version": 2,
  "base": "7feffb86d9666200bb3c899ac94a3256dc2a5d91",
  "reviewed": "37f524b74f8820a2dacec074ce6993492c8d644c",
  "covered": "4c4812ef512305c3b739558ef26808743dde2cc1",
  "authorSession": "01a1b6a4-7fb9-78c3-bc46-b774525be5bf",
  "reviewerSession": "/root/pool_review",
  "risk": "normal",
  "elapsedMinutes": 2.7333333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 164000,
    "evidence": "Author observed UTC clock around reviewer invocation and completion: 2026-11-07 16:03:34 UTC to 2026-11-07 16:06:18 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review found two eligibility gaps and a first-run routing test gap. The follow-up confirmed the exact expiry boundary, OpenAI subscription plan filtering and explicit GPT routing from an unpinned task. All 25 focused tests passed on the correction.",
  "findings": [
    {
      "id": "POOL-1",
      "severity": "substantive",
      "description": "The raw schedulable flag can remain true after an auto-paused account expires.",
      "paths": [
        "plugins/factory/src/config.mjs",
        "plugins/factory/tests/config.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Excluded such accounts at their Unix-second expiry and tested the exact boundary."
    },
    {
      "id": "POOL-2",
      "severity": "substantive",
      "description": "An OpenAI OAuth account without a paid plan could supply the winning pool score.",
      "paths": [
        "plugins/factory/src/config.mjs",
        "plugins/factory/README.md",
        "plugins/factory/tests/config.test.mjs",
        "plugins/factory/tests/gateway-workers.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Aligned with sub2api's subscription classifier and tested free and missing plan metadata."
    },
    {
      "id": "POOL-3",
      "severity": "substantive",
      "description": "A pinned Codex fixture could not detect a regression in first-run model routing.",
      "paths": [
        "plugins/factory/tests/gateway-workers.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Launched and pinned the explicit Codex model on a new task whose automatic route would be Claude."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/pool_review",
      "commit": "4c4812ef512305c3b739558ef26808743dde2cc1",
      "outcome": "cleared",
      "elapsedMinutes": 0.3333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 20000,
        "evidence": "Author observed UTC clock around reviewer invocation and completion: 2026-11-07 16:06:44 UTC to 2026-11-07 16:07:04 UTC."
      },
      "summary": "All three findings resolved. No new findings. All 25 focused tests and git diff --check passed."
    }
  ]
}
```
