---
roadmap: MO-26-11-21-01.02.56
date: 2026-11-21
tags: [engineering, devops, factory]
---

# Deliver complete private QA context

The old Fleet transport supported output artifacts but only text inputs. This adds controller
uploads under a separate immutable context/project/message prefix, binds their generation and
digest manifest into admission and idempotency, and permits retrieval only by the exact live
worker identity and attempt. Both execution routes verify and materialize private files outside
source, preserve them through clarification, and remove them before verified settlement. Existing
tasks remain compatible; incapable workers cannot claim input tasks. The dashboard omits inputs.

The existing object store, crypto, schema and execution primitives cover this responsibility;
no new package, credentials or scheduler. The source and deployment sequence are in the
[Factory contract](../../plugins/factory/README.md#controller-private-task-inputs).
Development qualification and idle rolling updates are documented alongside it. Capture remains
with each reporting project, and downstream integration adopts the same protocol.

Implementation was delegated through Fleet to an independent gateway worker at the exact
published claim. The controller verified the artifact digest and application before running
local checks. The worker's restricted environment could not establish loopback/guardian or the
pinned complexity checks; the controller independently passed those checks in the test environment.

## Validation

- 59 focused input, claim, runner, client, artifact and execution tests passed.
- 55 focused workspace/executor/guardian tests passed, including both provider input paths,
  continuation, cleanup, full-development enrollment and the original native guardian cases.
- Factory syntax check, root TypeScript checking and compilation passed. No generated drift.
- Complexity passed: 121 changed functions, 429 measured functions in12 files, CCN limit15;
  two handler-family cognitive warnings remain advisory.
- Both real Firestore-emulator concurrency and authenticated API tests passed. Required CI, independent review,
  cloud adoption, per-host qualification and the synthetic QA delivery remain pending.

No real QA media, metadata or report text is used as repository evidence. Operational rollout
receipts remain in the controller's private campaign record.

## Independent review

The first independent review found legacy-queue starvation and writable evidence. The controller
verified the returned correction patch and passed62 focused input, claim, runner, quota and complete
workspace checks, with no skips. Completed files are owner-read-only; this prevents ordinary
accidental writes and is not a boundary against deliberate same-account full-access changes.
Complexity passes130changed/435measured functions in12files, with the same two cognitive advisories.
Independent follow-up remains pending.

```morpheus-review
{
  "version": 2,
  "base": "1170c92160f1609fb55f3c5c441ddb4ea1127aad",
  "reviewed": "d44044a7818b7801c9c1573c26c485b256cb4ac7",
  "covered": "d44044a7818b7801c9c1573c26c485b256cb4ac7",
  "authorSession": "01a1fd51-79a5-7203-b5a0-ffb25351c967",
  "reviewerSession": "01a1fd73-7950-7970-b05f-f376c930e366",
  "risk": "high",
  "elapsedMinutes": 6.741,
  "timing": {
    "source": "runner",
    "durationMs": 404460,
    "evidence": "Fleet57ef7f3a-9c70-4002-8dc9-4949a87be7c2 admission7859a51f-f992-44bf-ab9e-ac320779021a verifiedtermination; verdictSHA2561f445acdf4ffe6f6fe4f69b89d34a9af5c7c545da854bc5a89d13dd9057e9745."
  },
  "outcome": "incomplete",
  "summary": "Initial independent review blocked on mixed-queue starvation and accidentally writable evidence. Both corrections are implemented and tested; independent follow-up remains pending.",
  "contextRead": [
    "AGENTS.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-21-deliver-qa-context.md",
    ".agent/worklog/2026-11-20-add-claude-fleet-workers.md",
    ".agent/worklog/2026-11-20-confine-claude-worker-temp.md",
    ".agent/worklog/2026-11-07-bind-factory-gateway-workers.md",
    ".agent/worklog/MO-26-11-14-23.37.24.md",
    "hq/product/roadmap/MO-26-11-21-01.02.56-deliver-qa-context.md",
    "hq/product/roadmap/MO-26-11-14-23.37.24-fleet-worker-build-caches.md",
    "hq/product/roadmap/MO-26-11-07-07.35.26-bind-factory-gateway-workers.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "FLEET-INPUTS-1",
      "severity": "substantive",
      "description": "A capable Codex slot has one queued private QA task and a steady stream of eligible legacy tasks. Heartbeat always places a legacy candidate before the private-input candidate. The runner returns on its first successful claim, so each freed slot takes another legacy task. Tracking only lastProvider cannot change the order for one provider. A synthetic in-process heartbeat probe returned five distinct legacy tasks ahead of the same pending input task on five successive heartbeats.",
      "paths": [
        "plugins/factory/src/fleet-api.mjs",
        "plugins/factory/src/fleet-runner.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "Give both task classes progress on a capable slot while preserving the legacy-only candidate view for incapable workers and existing provider quota checks. Add a mixed-backlog regression that proves actual claims from both classes across consecutive turns while both have eligible work. Implemented in adf27273;62focusedtests pass including mixed-backlog actualclaims, realowner write refusal, bothprovider continuation/cleanup."
    },
    {
      "id": "FLEET-INPUTS-2",
      "severity": "substantive",
      "description": "An operator-approved full-development worker runs a formatter or tool that writes a diagnostic JSON in place. Its own account owns the materialized file with mode 0600, so an ordinary write succeeds without changing permissions. Subsequent reads in that turn can see changed evidence; the next continuation rejects the retained file as corrupt instead of continuing with the admitted bytes. The local synthetic probe reproduced both the write and the continuation refusal.",
      "paths": [
        "plugins/factory/src/fleet-input-files.mjs",
        "plugins/factory/tests/fleet-input-files.test.mjs",
        "plugins/factory/tests/fleet-workspace.test.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "Expose the completed inputs with owner-only read permission and reject retained files with write bits before continuation. Pin the mode and an ordinary owner write refusal in tests while preserving tamper and cleanup coverage. Do not describe file mode as a security boundary against a deliberate same-UID full-access process. Implemented in adf27273;62focusedtests pass including mixed-backlog actualclaims, realowner write refusal, bothprovider continuation/cleanup."
    }
  ]
}
```
