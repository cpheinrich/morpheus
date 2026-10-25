# Controlled HQ transport qualification

This is an opt-in test identity on the dedicated Firebase demo emulators, joined to
the existing single-company Manager-owned Pool and its existing Paperclip process
agents. It does not deploy Firebase, grant production roles, enroll another company,
replace the installed personal plugin, or qualify a browser UI or inbox migration.
Read the [transport](paperclip-hq-transport.md), [actor](paperclip-hq-actor.md) and
[closeout](paperclip-closeout.md) contracts first.

## Provider-free qualification

After the optional transport package is installed and built as described in its
contract, run:

```sh
node scripts/paperclip-hq/run-qualification.mjs --fixture
```

`FIREBASE_CLI` can select the installed Firebase CLI executable or its JavaScript
entrypoint. This uses the same fixed demo project and loopback ports as the ordinary
transport emulator test. It refuses an existing `.env.local` and removes only its
own unchanged temporary settings. Default CI and this fixture never admit a real
provider.

The fixture sends a real authenticated callable through Functions and Firestore,
then the outbound connector invokes the actual Manager `hq.*` facade and existing
Pool. The upstream Paperclip API, SSH, quota reader and native CLI are fixtures.
It deliberately loses the acknowledgment after a local receipt is saved, creates
a fresh connector instance, and proves exactly one issue and provider invocation.
It also transports a question answer, independently reads the resulting file and
distinguishes the initial nonterminal command receipt from native completion.

## Explicit native admission

The native harness is never selected by a test glob. Its separate invocation is:

```sh
node scripts/paperclip-hq/run-qualification.mjs --native-target local/hq-target.json
```

The operator must first establish current authorization and ordinary subscription
quota, inspect the existing reservations and paused agents, stage a reviewed private
runtime at a new immutable path, install the exact mode-600 HQ mapping, and update
only the enrolled paused test agents' adapter runner path with explicit readback.
The staged runtime keeps the existing Pool home, config, account ledger and host
bindings. Stage `src/` and `scripts/` unchanged from the exact reviewed source, and
write `source-manifest.json` containing its full `sourceSha` and `files`, a map of
every staged source-relative file to its SHA-256. Pin the manifest's own hash in
the target. Dependencies and the older remote host runtime retain their actual
versions; a new controller runner is not evidence of a new remote host runner.

The private target has these required fields:

```json
{
  "version": 1,
  "authorization": "controlled-native-qualification",
  "sourceSha": "the-full-reviewed-Morpheus-commit",
  "sourceManifestSha256": "the-64-character-staged-manifest-hash",
  "runtime": "/explicit/private/immutable-controller-runtime",
  "poolHome": "/the/existing/coordinator-home",
  "repository": "/the/claimed/controller-repository",
  "proofDirectory": "/the/claimed/controller-repository/local/qualification-proof",
  "baseUrl": "http://127.0.0.1:3100",
  "companyId": "the-exact-existing-company-uuid",
  "projectId": null,
  "controllerId": "explicit-test-controller-id",
  "connectorId": "the-owner-installed-connector-id",
  "connectorUid": "emulator-connector-uid",
  "adminUid": "emulator-authorized-task-uid",
  "nonce": "unique-lowercase-test-nonce",
  "maxTurnMs": 180000,
  "profiles": [{ "name": "installed-profile-name", "provider": "codex", "agentId": "the-exact-existing-agent-uuid" }]
}
```

The strings above are placeholders. The target is a concrete operator declaration,
not permission to use a new account, endpoint, profile or authority. At most two
profiles and 300 seconds per profile are allowed. The script verifies the complete
staged manifest, exact controller/project/profile and adapter identities, empty
reservations, disabled periodic heartbeats, and a bounded paginated census of each
agent's unfinished work before resume. The owner-installed facade and native host
guards then revalidate their existing pins and fresh quotas. It never overrides a
model, permission, provider, quota, account reservation or unknown native outcome.

For exactly the bounded second turn, a profile may include
`followupConversationId`, the explicit first-turn conversation UUID. The harness
requires that conversation to be completed at turn1 with a saved native session,
updates only the same nonce file to phase2, and verifies the unchanged native
session plus the preserved original nonce/provider. Use a new proof directory;
never use this option to replay an unknown turn or retry arbitrary prior work.

It persists intent before resume/enqueue, admits only a tiny nonce file write,
deliberately disconnects after saving the command receipt, and recovers through a
new connector. A repeated cloud request observes the same receipt and turn. Final
success requires completed native work with verified termination and an independent
SSH read of the exact artifact bytes. The script records the artifact hash and
private receipts, observes exact operation identities during cleanup, stops only
its own nonterminal conversations, and re-pauses every agent it resumed. Inspect
the retained cleanup proof even after a failed invocation; an unverified cleanup
is a failure, not authorization to rerun the native intent.

The Firebase backend currently records a verified human test actor. A general task
authorization supports the supplied deterministic start prompt. The harness will
not answer an unexpected native question as that human. Actual automated
clarifications need the actor-aware agent/reason path; tool permission requires
actual human authority. The question fixture and earlier bridge qualification are
separate evidence from this native transport run.

## Frozen closeout evidence

After independently acquiring and reviewing the exact issue, all bounded comments
and any interactions, write an explicit `operator-frozen-v1` JSON input under
`local/`. Preserve actual message identities/timestamps and operator-declared source
bounds. An empty accepted-answer list makes no human acceptance claim. Include the
independently read nonce file as a local attachment with its actual SHA-256, then
run the existing closeout exporter against the exact company/issue/thread target.

Verify the snapshot's byte-derived identity, attachment blob bytes, honest
`atomic: false` freeze metadata, and an identical replay reporting `created: false`.
This proves the frozen exporter output, not transactional upstream acquisition or
operator acceptance. Do not commit raw private receipts, account/native identities,
credentials, private paths or unreviewed provider prose to the public repository.

The task worklog records the actual attempted providers, quota outcome, exact
runtime versions, receipts, independent artifacts, cleanup and remaining limits.

On October25 the joined fixture passed and the actual Codex start/follow-up both
completed with verified termination. Independent SSH reads produced two63-byte
versions of the nonce file, and both resumed turns retained one native session.
Both enrolled agents were read back paused, all existing reservation arrays were
empty and the owned remote process identities were absent. The
[frozen JSON closeout](../.agent/paperclip-closeouts/4925919d-5666-4a4e-b4c5-b59cc0176eee/6483543d-ed4e-4057-ac74-6025716b1184/34b83582b96861ef30520f8bb5da07bb2bca65d0b3547952223f9ac7c57c5b1e.json)
retains three actual comments, no interactions or accepted-human-answer claims,
both independently verified artifact versions and the Claude not-run limitation.
The input is an operator freeze with `atomic: false`, not an upstream transaction.
