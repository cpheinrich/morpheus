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
