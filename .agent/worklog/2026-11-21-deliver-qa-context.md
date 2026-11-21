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
  two existing handler-family cognitive warnings remain advisory.
- The Firestore concurrency suite is pending at this checkpoint. Required CI, independent review,
  cloud adoption, per-host qualification and the synthetic QA delivery remain pending.

No real QA media, metadata or report text is used as repository evidence. Operational rollout
receipts remain in the controller's private campaign record.
