---
roadmap: MO-26-11-07-11.41.40
tags: [engineering, devops, infrastructure]
---

# Factory remote worker pilot

The operator approved implementation through deployment and a live one-slot pilot from the
existing controller. A brief cutover pause is acceptable. The existing gateway and subscription
allowance cover the planned model probe. Treat hosted resource provisioning and identity
enrollment as separate operations from emulator tests. Keep real deployment targets and any
credential references in the private operator record.

An independent design review identified two separate identities to preserve in addition to the
logical task ID: the current controller root and the concrete invocation. The remote attempt
also binds a host, slot and workspace. A lease timeout is a signal to investigate, and releasing
ownership requires cleanup evidence. Firestore's SDK is the existing supported transport for
the integration test. A2A's task semantics provide the contract without another transport
dependency. Artifact tests use the injected object writer and verify exact generation and digest.

The first source slice preserves the MCP interface and local provider flows. The emulator
exercises the new transaction and listener boundary. Remote enrollment, executable runner
integration, and live acceptance remain separate from that proof.

Early source review reproduced stale claim replay, an unrecoverable partial artifact upload,
incorrect local stop status, and reuse of a superseded question. Follow-up code expires claim
replay, verifies existing upload generations and digests, records explicit guardian cancellation,
and projects the latest logical task attempt. The emulator now also disconnects its controller
while the task settles and checks cancellation retains its lock until cleanup is verified.
This early review does not clear the pending authenticated runner path for release.

Local verification passed 56 focused Factory tests, 40 CI path-selection tests, Firestore
emulator integration, workflow lint, complexity, typecheck, compile, and the project index.

The cancellation follow-up also confirms an empty local process group before reporting canceled.
An unverified explicit cancel remains nonterminal and blocks workspace reuse after restart.
The focused Factory suite passed 58 cases, and all seven artifact tests also passed on a second
macOS host against a local object adapter. The reviewed cloud integration and provider-backed
pilot still need to be run.

The next slice connects the opt-in Codex tool to an authenticated service and
a Studio supervisor. Firestore wake documents contain only a version marker.
The API enforces root and host ownership. The gateway executor runs as a
separate OS principal and copies only declared artifact bytes back to the
supervisor, which uploads through the same attempt-scoped API. A dedicated
Firestore database avoids replacing rules for existing workloads. Firebase
Admin and the existing Firebase web SDK provide authentication and listeners.

Validation passed 62 focused Factory tests, including the executable Studio
fixture, and two Firestore emulator tests. The API test exercises disallowed
identities, role and root isolation, native wake listeners, clarification
and generation-bound download using a storage fixture. Typecheck, compile,
project index, package syntax and complexity gates passed. Cloud Run, the
real storage adapter and a provider-backed Studio run remain deployment
acceptance steps.

Independent review found shared Firebase client teardown, missing cleanup-proof
recovery, missing quota and desktop authority checks, and an oversized Studio
envelope. The follow-up isolates Firebase client lifetimes, reads durable
guardian proof without spawning, applies the existing root permissions and
disable rules, and sends only the active prompt and launch binding. The Studio
supervisor uses Sub2API's scoped account and quota reads, including both live
Codex windows, before launch. The inference key remains separate.

Independent review cleared all five substantive findings and one documentation note on the follow-up. All 106 focused Factory cases and both Firestore emulator cases passed. The Studio also passed the isolated executor fixture with a stubbed Codex provider. Google Cloud IAM, direct gateway access, Studio administrator setup, and a real provider run remain rollout acceptance.

```morpheus-review
{
  "version": 2,
  "base": "ebc692dcc1ef3d6bd0a649e5c3a6a4b5607d7fc4",
  "reviewed": "a10661469d5c85ff65a5ef2609457059ed95a8e1",
  "covered": "232d6e24a908e8408408a1b7ebafac8645c5b5e5",
  "authorSession": "01a1b6a4-7fb9-78c3-bc46-b774525be5bf",
  "reviewerSession": "/root/studio_service_review",
  "risk": "high",
  "elapsedMinutes": 2.9450833333333333,
  "timing": {
    "source": "clock",
    "durationMs": 176705,
    "evidence": "Codex parent transcript UTC call at 20:33:25.171Z and /root/studio_service_review verdict at 20:36:21.876Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared all five substantive findings and one documentation note on the follow-up. All 106 focused Factory cases and both Firestore emulator cases passed. The Studio also passed the isolated executor fixture with a stubbed Codex provider. Google Cloud IAM, direct gateway access, Studio administrator setup, and a real provider run remain rollout acceptance.",
  "findings": [
    {
      "id": "SR1",
      "severity": "substantive",
      "description": "Closing a desktop request terminated a concurrent wait's shared Firebase client.",
      "paths": [
        "plugins/factory/src/fleet-client.mjs"
      ],
      "disposition": "fixed",
      "response": "Use a named app per connection and test overlapping client cleanup."
    },
    {
      "id": "SR2",
      "severity": "substantive",
      "description": "A restarted supervisor never saw durable cleanup proof and held the Studio slot indefinitely.",
      "paths": [
        "plugins/factory/src/fleet-runner.mjs",
        "plugins/factory/README.md"
      ],
      "disposition": "fixed",
      "response": "Read the exact admission proof through the fixed executor and settle only after verification. Test recovery without launching."
    },
    {
      "id": "SR3",
      "severity": "substantive",
      "description": "Remote launch did not check Factory's gateway quota threshold.",
      "paths": [
        "plugins/factory/src/fleet-api.mjs",
        "plugins/factory/src/gateway-worker.mjs"
      ],
      "disposition": "fixed",
      "response": "Require fresh Sub2API scoped quota for the enrolled Codex gateway before launch and verify the endpoint and threshold in focused fixtures."
    },
    {
      "id": "SR4",
      "severity": "substantive",
      "description": "Remote writes could start or continue from a read-only or disabled root.",
      "paths": [
        "plugins/factory/scripts/fleet-mcp.mjs",
        "plugins/factory/src/service.mjs"
      ],
      "disposition": "fixed",
      "response": "Use the current verified Codex snapshot and the existing root, task, and repository disable checks on submit and answer."
    },
    {
      "id": "SR5",
      "severity": "substantive",
      "description": "The executor duplicated the brief in its envelope and could reject valid input as unverified cleanup.",
      "paths": [
        "plugins/factory/src/fleet-execution.mjs",
        "plugins/factory/scripts/fleet-executor.mjs"
      ],
      "disposition": "fixed",
      "response": "Pass only the launch binding and current prompt. Recognize prelaunch rejection and test the worst-case valid prompt."
    },
    {
      "id": "SR6",
      "severity": "minor",
      "description": "The older diagram showed direct task and storage access.",
      "paths": [
        "plugins/factory/src/host/docs/fleet-task-contract.md"
      ],
      "disposition": "fixed",
      "response": "Link to the accurate authenticated pilot flow in the package README."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/studio_service_review",
      "commit": "3cdeca9d705fce07a95eb810eb4fef06da7b8ab0",
      "outcome": "cleared",
      "elapsedMinutes": 0.9549,
      "timing": {
        "source": "clock",
        "durationMs": 57294,
        "evidence": "Codex parent transcript UTC call at 20:42:08.641Z and /root/studio_service_review verdict at 20:43:05.935Z."
      },
      "summary": "All six findings resolved. Five independent targeted fixtures passed. No new findings."
    },
    {
      "reviewerSession": "/root/studio_service_review",
      "commit": "232d6e24a908e8408408a1b7ebafac8645c5b5e5",
      "outcome": "cleared",
      "elapsedMinutes": 0.3574833333333333,
      "timing": {
        "source": "clock",
        "durationMs": 21449,
        "evidence": "Codex reviewer transcript task_started 2026-11-08T06:02:28.106Z to task_complete 2026-11-08T06:02:49.555Z."
      },
      "scopeReason": "Live Studio activation exposed a capacity calculation that excluded reclaimable memory. The follow-up covers only the capacity correction and its focused tests.",
      "summary": "Cleared the macOS capacity correction. All ten focused tests passed independently and native vm_stat parsed on the local Mac. No new findings."
    }
  ]
}
```

The first Studio LaunchDaemon reported fresh heartbeats with zero capacity. The
host had about 2.7 GiB of immediately free pages and 26.8 GiB of inactive pages.
The pilot's 4 GiB reserve needs an estimate that includes reclaimable inactive
pages. The late correction parses a native macOS VM sample, retains the reserve,
and falls back to immediately free pages if the sample cannot be read. Focused
capacity and runner tests cover the observed host sample and reserve boundary.

## Live rollout acceptance

The controller submitted a provider-backed Studio task, received and answered its
clarification, verified the returned artifact's generation and SHA-256 digest,
and opened it on the Pro. The Studio slot released and resumed heartbeats.
A separate real Evo implementation task used the same Studio route, returned a
verified patch, and continued through independent review, required CI and merge.
The pilot enrolled a specific commit for each checkout. Automated checkout setup
and integration into the existing delegation entry point are follow-up work.
