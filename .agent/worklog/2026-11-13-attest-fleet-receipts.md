---
roadmap: MO-26-11-13-23.32.17
tags: [engineering, devops]
---

Fleet carries the latest verified invocation into the settlement transaction. The
gateway worker distinguishes a CLI `thread.started` event from a preceding
admission's cached session ID. The executor binds recovery to the exact Fleet task
and attempt. The supervisor journals the verified settlement before sending it.
The service commits the receipt with the task, then reads it only on a matching
controller identity and root. A legacy execution without verified invocation
evidence has no receipt. This also separates proof of termination from the model
and task outcomes.

The project-scoped readiness operation returns eligible slots and reports heartbeat
freshness and recent gateway-compatible quota. Capacity and quota observations
end at placement candidacy. Claim and pre-invocation authorization still apply.
No generic module or new dependency is needed. The implementation uses the Fleet
journal, Firestore transaction, and the existing gateway quota reader.

See the earlier [remote worker pilot](2026-11-07-run-factory-workers-remotely.md),
[checkout routing](2026-11-07-route-fleet-checkouts.md), [project isolation](2026-11-08-route-studio-projects.md)
and [operator instructions](../../plugins/factory/README.md#read-slot-readiness-and-a-terminal-receipt).

The test plan uses synthetic Codex events with the real local guardian and executor,
a mocked gateway quota source, and a loopback Firestore emulator. It does not
use a model subscription or alter any deployed resource. Context MCP resolved
the Evo project in the desktop chat, so project context discovery used
`morpheus context search` in this Morpheus worktree. The current trunk graph had
no recorded coverage issue for the affected source and tests. The linked
worktree's exact source and diff were checked directly.

The initial independent review was interrupted after reproducing a legacy continuation regression. A resumed review cleared the fix after the full Fleet binding and original Codex session home both survived repeated continuation. Local tests used synthetic worker output and a Firestore emulator.

```morpheus-review
{
  "version": 2,
  "base": "5f6d5d3d0af1a5fbbd8dfc0429ab8ee5b8f8382f",
  "reviewed": "dfc77e89a045cd5cbc5c2dc72e47df613b720a0b",
  "covered": "2003c654ef57de2d2583872643f36fbbade57481",
  "authorSession": "01a1d8f8-0063-70e0-bf8c-c5456d865be8",
  "reviewerSession": "/root/morpheus_700/fleet_review",
  "risk": "high",
  "elapsedMinutes": 4.185066666666667,
  "timing": {
    "source": "clock",
    "durationMs": 251104,
    "evidence": "Codex parent transcript: invocation at 2026-11-14T07:45:45.953Z, parent turn interrupted at 2026-11-14T07:49:57.057Z."
  },
  "outcome": "complete",
  "initialOutcome": "incomplete",
  "summary": "The initial independent review was interrupted after reproducing a legacy continuation regression. A resumed review cleared the fix after the full Fleet binding and original Codex session home both survived repeated continuation. Local tests used synthetic worker output and a Firestore emulator.",
  "contextRead": [
    "AGENTS.md",
    ".agent/decisions.md",
    "hq/product/roadmap/MO-26-11-13-23.32.17-attest-fleet-receipts.md",
    "plugins/factory/README.md",
    "plugins/factory/src/host/docs/fleet-task-contract.md",
    ".agent/worklog/2026-11-07-run-factory-workers-remotely.md",
    ".agent/worklog/2026-11-07-route-fleet-checkouts.md",
    ".agent/worklog/2026-11-08-route-studio-projects.md",
    ".agent/worklog/2026-11-13-attest-fleet-receipts.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/independent-review.md",
    "architecture.md",
    "qa/acceptance/MO-26-11-07-11.41.40.md",
    "hq/product/roadmap/MO-26-11-13-13.46.43-document-read-only-operational.md"
  ],
  "findings": [
    {
      "id": "FLEET-01",
      "severity": "substantive",
      "description": "The new Fleet binding changed CODEX_HOME during a legacy continuation, leaving Codex unable to find the retained thread.",
      "paths": [
        "plugins/factory/src/gateway-worker.mjs",
        "plugins/factory/tests/unattended-worker.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Retained the original home namespace through repeated continuation and exercised the actual storage boundary in a fake CLI under the real guardian."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_700/fleet_review",
      "commit": "2003c654ef57de2d2583872643f36fbbade57481",
      "outcome": "cleared",
      "elapsedMinutes": 0.7446333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 44678,
        "evidence": "Codex parent transcript: invocation at 2026-11-14T07:54:49.931Z, substantive verdict observed at 2026-11-14T07:55:34.609Z."
      },
      "summary": "FLEET-01 cleared. Three continuation tests and both diff checks passed independently. No remaining findings."
    }
  ]
}
```
