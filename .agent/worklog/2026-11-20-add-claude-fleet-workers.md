---
date: 2026-11-20
roadmap: MO-26-11-20-14.21.09
tags: [engineering, devops, factory]
---

# Simplify Fleet handoffs and add Claude workers

The rollout exposed three recurring handoff problems. A lost submit acknowledgement left
owners unsure what to retry. Queued tasks exposed their state without the reason for the wait.
A single oversized response clipped exact review evidence during protected pre-merge review.
Fleet now reuses the same message ID on a retryable submit, includes a queue reason in the
existing snapshot, and prepares independently checkable per-path review evidence against the
published pair of commits.

Claude shares the existing service, slot and workspace leases, scoped quota checks, artifact
path and cleanup receipt with Codex. The service binds the enrolled provider and model on
submission. Each project retains its existing authorization and protected delivery path.

The Fleet implementation returned a private patch with an exact source receipt and verified
cleanup. The controller verified the patch and its digest. The controller extended the restricted
macOS profile and independently ran the Factory, review packet, typechecking, compile and
complexity checks. Existing review gates require the reviewed source and CI before host activation.

Initial review found three operational gaps. Bounded discovery now alternates between runnable
provider windows in the same index. Claude admission requires an existing Git-backed worker
route. A prelaunch quota failure releases the initial slot and workspace and restores the same
task to its queue. A saved answer keeps the live lease and original session while Claude quota
recovers. Focused regressions verified these cases. The controller corrected the draft Test plan
to name the exact suites that ran.

The follow-up confirmed the original fixes and found a disk leak on repeated quota holds. The
supervisor now fetches shared mirror data before checking fresh quota and defers the attempt
checkout to the admitted launch. Repeated holds made zero attempt checkouts in the real-Git
fixture. The controller joins a returned receipt to the exact prior attempt and exposes a queued
receipt as historical evidence.

A subsequent reviewer found that creating the checkout during the journal’s running phase could
strand a reservation after a restart before provider admission. The supervisor checks Claude
quota after the shared source fetch and before checkout materialization within the recoverable
preparation phase. Restart during preparation releases the exact task’s two leases with a
never-launched receipt. A saved answer still checks quota before its continuation.

A fourth independent turn found the remaining pre-admission gap during the executor’s Git
revalidation. Recovery can now atomically retire a never-reserved admission in the same
exclusive namespace. A delayed executor cannot reserve that ID. Existing admission directories
still require normal termination proof. The regression pauses the real executor during Git
validation, restarts the supervisor, verifies release of both exact leases with a never-launched
receipt, and confirms that the delayed executor starts no provider.

## Independent review

The initial reviewer blocked on mixed-pool queue progress, unsupported admission, and losing work when quota changed. The follow-up confirmed those fixes and blocked on accumulating unused checkouts across repeated holds. The third turn confirmed that fix and identified interrupted checkout recovery as a further blocker. A fourth turn found a remaining gap while the executor revalidated Git. The final turn verified exact prelaunch retirement, lease recovery and preservation of ambiguous admission evidence, then cleared the published candidate.

```morpheus-review
{
  "version": 2,
  "base": "886e4acb48b8468035439215f92f65fb083cc885",
  "reviewed": "0af90ab4bb7dedf4a2c25a08d7a25ae854df56e4",
  "covered": "3f9f7b3be6b4247e8c10d74a19dc7d22dfbbd746",
  "authorSession": "01a1edd7-8c88-7a62-a255-cbc13c753532",
  "risk": "high",
  "outcome": "complete",
  "summary": "The initial reviewer blocked on mixed-pool queue progress, unsupported admission, and losing work when quota changed. The follow-up confirmed those fixes and blocked on accumulating unused checkouts across repeated holds. The third turn confirmed that fix and identified interrupted checkout recovery as a further blocker. A fourth turn found a remaining gap while the executor revalidated Git. The final turn verified exact prelaunch retirement, lease recovery and preservation of ambiguous admission evidence, then cleared the published candidate.",
  "contextRead": [
    ".agent/decisions.md",
    ".agent/worklog/2026-11-07-bind-factory-gateway-workers.md",
    ".agent/worklog/2026-11-07-route-fleet-checkouts.md",
    ".agent/worklog/2026-11-07-run-factory-workers-remotely.md",
    ".agent/worklog/2026-11-20-add-claude-fleet-workers.md",
    "AGENTS.md",
    "CLAUDE.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-20-14.21.09-add-claude-fleet-workers.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "FLEET-01",
      "severity": "substantive",
      "description": "An unavailable Claude pool can starve eligible Codex work through the shared 16-row heartbeat query.",
      "paths": [
        "plugins/factory/src/fleet-api.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "Used provider-specific indexed candidate windows and verified Codex progress behind a full Claude queue."
    },
    {
      "id": "FLEET-02",
      "severity": "substantive",
      "description": "Global Claude enrollment advertises and accepts the existing pinned-checkout route, but the worker always rejects it.",
      "paths": [
        "plugins/factory/src/fleet-api.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "Refused Claude readiness and admission before queueing on pinned-only and viewer-only routes. Every active execution route is Git-backed."
    },
    {
      "id": "FLEET-03",
      "severity": "substantive",
      "description": "A transient unknown quota at the mandatory prelaunch check settles a Claude task as failed rather than holding it.",
      "paths": [
        "plugins/factory/src/fleet-execution.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "A quota hold requeues the same untouched task after releasing its leases and preserves a saved answer on the same continuing attempt."
    },
    {
      "id": "FLEET-04",
      "severity": "minor",
      "description": "The draft PR Test plan names tests/fleet-readiness.test.mjs, which is not present in the candidate tree.",
      "paths": [
        "plugins/factory/tests/fleet-workspace.test.mjs"
      ],
      "turn": 1,
      "disposition": "fixed",
      "response": "Corrected the exact focused test file list and recorded the 101 passing cases."
    },
    {
      "id": "FLEET-05",
      "severity": "substantive",
      "description": "One quota-held task can leave unlimited prepared Git checkouts",
      "paths": [
        "plugins/factory/src/fleet-runner.mjs"
      ],
      "turn": 2,
      "disposition": "fixed",
      "response": "Claude preparation now fetches shared source without creating the attempt checkout. The real-Git fixture confirms zero checkouts across two holds. The post-gate executor creates the exact checkout and reopens it for continuation."
    },
    {
      "id": "FLEET-06",
      "severity": "minor",
      "description": "Status can pair a queued task snapshot with a different attempt's receipt",
      "paths": [
        "plugins/factory/src/fleet-api.mjs"
      ],
      "turn": 2,
      "disposition": "fixed",
      "response": "Join receipts to the snapshot\u2019s exact attempt ID and expose requeue evidence as previousAttemptReceipt."
    },
    {
      "id": "FLEET-07",
      "severity": "substantive",
      "description": "The delta moves potentially lengthy Git checkout work from the recoverable preparing phase into the journaled running phase, before the gateway admission record exists. If the host reboots or the executor dies during the checkout, recovery reads the running journal, but workerResult throws Unknown admission ID. The executor returns unverified completion; the runner cannot release either lease. The slot stops claiming even unrelated work, and the workspace stays held despite no model starting. In the previously reviewed commit, interruption during this same checkout recovered through preparing and settled as never launched. There was already a short launch-to-reservation gap; this change puts all initial Claude checkout work in that gap.",
      "paths": [
        "plugins/factory/src/fleet-runner.mjs"
      ],
      "turn": 3,
      "disposition": "fixed",
      "response": "Kept checkout in preparing and added atomic retirement of an exact unreserved admission. A real executor barrier verifies both leases release and a delayed executor cannot start. Existing ambiguous reservations still require cleanup evidence."
    }
  ],
  "reviewerSession": "01a1fb27-b158-79b1-acd3-9c9808ff0576",
  "elapsedMinutes": 7.539833333333333,
  "timing": {
    "source": "runner",
    "durationMs": 452390,
    "evidence": "Fleet run 60f694a0-29f5-4464-bc8a-bb629bf6dd56, admission f76641b5-4cfe-41f2-965e-48a45f9f476a, verified launch and termination. Private verdict SHA-256 78158bcfc93120cb3bac68cd2e3b63c7ebcb3555d8cd87be527ecff199385a4c."
  },
  "followUps": [
    {
      "reviewerSession": "01a1fb37-4013-75f2-98ec-0656d027196f",
      "elapsedMinutes": 20.147333333333332,
      "timing": {
        "source": "runner",
        "durationMs": 1208840,
        "evidence": "Fleet run 9c644aa3-d82a-486d-a628-7028535c8d42, admission bfbe70c5-caf6-4770-8bf5-09ab8ac240c0, verified launch and termination. Private verdict SHA-256 e10e50e804f1ec9713546e2c665bcead10547610927bdcb4015ceca652086375."
      },
      "commit": "0cda9ada6c146b6595452c11d3b2ea9b7bc88429",
      "outcome": "blocked",
      "summary": "The four earlier findings are addressed, but the new prelaunch requeue path can leave an unbounded number of never-used Git checkouts on the host for one task. A synthetic check using real Git checkouts reproduced it across two quota holds with no inference launches. Review only; no tracked changes or external actions.",
      "blockedOn": [
        "FLEET-05"
      ],
      "handoff": {
        "reason": "Fresh Fleet session at the newly published source. The prior session was bound to the original candidate.",
        "findings": [
          "FLEET-01",
          "FLEET-02",
          "FLEET-03",
          "FLEET-04"
        ]
      }
    },
    {
      "reviewerSession": "01a1fb55-ec25-73b0-a172-ae96c9407897",
      "elapsedMinutes": 6.292783333333333,
      "timing": {
        "source": "runner",
        "durationMs": 377567,
        "evidence": "Fleet run 3e16b7ba-4407-4fad-a1f1-ae8c5b8d383a, admission 8fca5721-11ac-45ed-86e7-fc6af4c5df29, verified launch and termination. Private verdict SHA-256 d6080bf26416d47dbb0650fc2693eec26cfa9843e3c40d64e57569dbb014398e."
      },
      "commit": "4ad2c5d5ad60517adfd34a8b990faf53d1813a84",
      "outcome": "blocked",
      "summary": "The delta moves potentially lengthy Git checkout work from the recoverable preparing phase into the journaled running phase, before the gateway admission record exists. If the host reboots or the executor dies during the checkout, recovery reads the running journal, but workerResult throws Unknown admission ID. The executor returns unverified completion; the runner cannot release either lease. The slot stops claiming even unrelated work, and the workspace stays held despite no model starting. In the previously reviewed commit, interruption during this same checkout recovered through preparing and settled as never launched. There was already a short launch-to-reservation gap; this change puts all initial Claude checkout work in that gap.",
      "blockedOn": [
        "FLEET-07"
      ],
      "handoff": {
        "reason": "Fresh Fleet session at the corrected candidate. The prior session was bound to the previous source.",
        "findings": [
          "FLEET-01",
          "FLEET-02",
          "FLEET-03",
          "FLEET-04",
          "FLEET-05",
          "FLEET-06"
        ]
      }
    },
    {
      "reviewerSession": "01a1fb5f-3932-76d2-b38b-36b6ec167538",
      "elapsedMinutes": 5.4901,
      "timing": {
        "source": "runner",
        "durationMs": 329406,
        "evidence": "Fleet run fbe5555a-4cdd-441a-bfda-af513f4c5a3e, admission 2298dbfc-432d-4b9d-84fd-0146eae04573, verified launch and termination. Private verdict SHA-256 07d8849b26322890236a5a0ff3423283edbb252220165c8ec21ed64a8bed19a6."
      },
      "commit": "befd22e19db08a0865e3bda80106e97df4a6b7dd",
      "outcome": "blocked",
      "summary": "High-risk lease recovery follow-up. Claude checkout creation now runs in preparing, but the production executor still reopens and checks the checkout in running before any durable worker admission exists. A host restart that interrupts the executor in that interval still strands both leases. The new restart test never calls the production executor and cannot distinguish the previous candidate's checkout ordering.",
      "blockedOn": [
        "FLEET-07"
      ],
      "handoff": {
        "reason": "Fresh Fleet session at the corrected candidate. The prior session was bound to the previous source.",
        "findings": [
          "FLEET-01",
          "FLEET-02",
          "FLEET-03",
          "FLEET-04",
          "FLEET-05",
          "FLEET-06",
          "FLEET-07"
        ]
      }
    },
    {
      "reviewerSession": "01a1fb6b-6f0d-7721-ae86-4f54a9929d7b",
      "elapsedMinutes": 3.8511,
      "timing": {
        "source": "runner",
        "durationMs": 231066,
        "evidence": "Fleet run 45d70db2-438a-4598-9a1c-a184c6f0f615, admission 49cea6aa-627f-4925-892f-6e30f3822649, verified launch and termination. Private verdict SHA-256 579045c872a140694147b42e073aea05a73ce3262b6b3623ee2714f6bac38c3f."
      },
      "commit": "3f9f7b3be6b4247e8c10d74a19dc7d22dfbbd746",
      "outcome": "cleared",
      "summary": "High-risk shared lease recovery: this focused follow-up is complete, with no findings. The same exclusive path serializes the exact retirement marker and executor reservation. A retirement winner gives the matching task and attempt a never-launched receipt; a reservation winner retains the existing termination-proof requirement. No earlier finding is reopened. No repository files were changed, and no external action or live host activation was performed.",
      "handoff": {
        "reason": "Fresh Fleet session at the corrected candidate. The prior session was bound to the previous source.",
        "findings": [
          "FLEET-01",
          "FLEET-02",
          "FLEET-03",
          "FLEET-04",
          "FLEET-05",
          "FLEET-06",
          "FLEET-07"
        ]
      }
    }
  ]
}
```
