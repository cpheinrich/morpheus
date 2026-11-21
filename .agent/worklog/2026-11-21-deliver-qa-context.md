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
  "summary": "Review confirmed fair scheduling and the protected scheduler integration. The evidence file correction still allowed ordinary atomic replacement; the input directory is now sealed before launch, and independent verification of that correction remains pending.",
  "contextRead": [
    ".agent/decisions.md",
    ".agent/worklog/2026-11-07-bind-factory-gateway-workers.md",
    ".agent/worklog/2026-11-20-add-claude-fleet-workers.md",
    ".agent/worklog/2026-11-20-confine-claude-worker-temp.md",
    ".agent/worklog/2026-11-21-deliver-qa-context.md",
    ".agent/worklog/2026-11-21-lease-isolated-fleet-tasks.md",
    ".agent/worklog/MO-26-11-14-23.37.24.md",
    "AGENTS.md",
    "architecture.md",
    "docs/runbooks/device-bootstrap.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-07-07.35.26-bind-factory-gateway-workers.md",
    "hq/product/roadmap/MO-26-11-14-23.37.24-fleet-worker-build-caches.md",
    "hq/product/roadmap/MO-26-11-21-01.02.56-deliver-qa-context.md",
    "hq/product/roadmap/MO-26-11-21-01.02.57-lease-isolated-fleet-tasks.md",
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
      "response": "Expose the completed inputs with owner-only read permission and reject retained files with write bits before continuation. Pin the mode and an ordinary owner write refusal in tests while preserving tamper and cleanup coverage. Do not describe file mode as a security boundary against a deliberate same-UID full-access process. Implemented in adf27273;62focusedtests pass including mixed-backlog actualclaims, realowner write refusal, bothprovider continuation/cleanup. Follow-up2 reproduced rename-based replacement through the writable directory. Commit7a4dd390 seals populated directories to0500, requires that mode on continuation, and reopens cleanup through a verified no-follow directory handle.31focused input/workspace tests pass with no skips, including actual owner rename refusal and both providers."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a1fd8c-f658-70d2-8b0b-4db680d3b00a",
      "elapsedMinutes": 7.122633333333333,
      "timing": {
        "source": "runner",
        "durationMs": 427358,
        "evidence": "Fleetc35f807b-b3de-4752-8925-ab9c5493f935 admission45d55ead-e4ae-4f76-99f1-3806162fa4ca verifiedtermination; verdictSHA25655e572a431795a13310cbc6b4dcba6f1a7233d53b73331b066fdff5907588c8f."
      },
      "commit": "64ce2f752325835ae451d4ae9eb5cb0da3557311",
      "base": "d5d059222d786246915c714608f36311d26aac9e",
      "scopeReason": "Inspect the hand-resolved protected scheduler integration and replay helper alongside both prior finding corrections.",
      "outcome": "blocked",
      "summary": "Complete review, blocked on FLEET-INPUTS-2. FLEET-INPUTS-1 is resolved. No new finding IDs. I inspected the hand-resolved integration 32b91a8e4da185ce051c9c2d0d61590ef7ae0a35 and the subsequent replay refactor: the first admission verifies storage metadata and retains the per-task lease; stable replay preserves the original placement while rejecting changed source or manifest. An independent in-process API probe confirmed this for a private Claude task even after the operator changed eligible slots and lease policy. It also executed four alternating successful claims with all four provider/input classes still backlogged. Forty-five focused Node tests passed without skips (claims, execution, input files, quota and runner; host Zod 4.6.7, not the lockfile's 4.6.6). Factory source check and git diff --check passed. The decisive non-root synthetic probe showed that a normal atomic save replaces a mode-0400 file without changing its permissions and breaks continuation. No real QA data or live provider runs. The author reports both provider fixture runs and earlier emulator evidence; required CI on the eventual candidate, worker rollout and synthetic QA Build/deploy acceptance remain with the author. GitHub CLI lacked authentication for PR #756, so I used the supplied PR intent, test results and worklog. The packet worktree path was inaccessible; the admitted checkout had the exact candidate and trusted target Git objects. Live Context MCP returned candidate context; the Factory README was outside the index, so I used CLI context search and read the exact README from the admitted checkout. The retained flow diagram makes custody clear; a useful advisory addition would be to show the continuation and cleanup path. No visual evidence is required for this backend change. Record the invocation duration and session identity from runner metadata. No tracked files changed; no GitHub mutation, merge or deployment performed.",
      "blockedOn": [
        "FLEET-INPUTS-2"
      ],
      "handoff": {
        "reason": "Fresh Fleet source binding for the published correction; the original session remains bound to its admitted commit.",
        "findings": [
          "FLEET-INPUTS-1",
          "FLEET-INPUTS-2"
        ]
      }
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "32b91a8e4da185ce051c9c2d0d61590ef7ae0a35",
      "reason": "Hand-resolved fleet-api submit and fleet-mailbox replay to combine protected task-scoped leases and placement-preserving replay with immutable private inputs. Independently inspected in follow-up2."
    }
  ]
}
```

The second review independently cleared fair scheduling and the hand-resolved task-isolation
integration, then reproduced an ordinary atomic-save route around read-only file mode. The next
correction seals the directory before launch and restores write access only through verified
cleanup.31focused input/workspace tests pass without skips; the exact-account worker also passed
loopback and pinned complexity checks under its repaired profile. Complexity passes140changed /
450measured functions in12files, with the same two advisory warnings. Independent closing review
remains pending. The subsequent live-web capture trunk merge was automatic.
