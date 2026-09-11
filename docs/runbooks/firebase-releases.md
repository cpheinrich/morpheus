# Firebase deployment and client readiness

`cpheinrich/morpheus/.github/actions/firebase-release@main` extracts the boundary demonstrated
by [Evo PR205](https://github.com/darwin-health/evo/pull/205). It is a composite action so credentials
remain in caller-owned jobs. Adding the shared action does not activate any consumer or deploy
anything. Evo's proposal remains held until its separate activation requirements are approved.

## What it verifies

The caller checks out a full **tested main SHA** and supplies it as `source-sha`. The action
checks checkout identity and current GitHub main before reading policy, immediately before a
rules deployment, and before and after live verification. Stale runs fail; retry the latest main.
Policy, rules and index definitions come from that commit's immutable Git blobs, so a generated
or locally edited file cannot become the deployed source. The caller owns test coverage and
must bind the supplied SHA to the successful test job/run. `tests-result: success` is required
for deployment. For `workflow_run`, the action also verifies the event's successful, same-repo,
main-push identity and exact tested SHA. It never accepts PR events for deployment.

Verification reads the actual Firebase Rules releases and ruleset source, requires exact SHA-256
content equality, rejects releases younger than ten minutes, and traverses all Firestore index
pages to require every declared index to be READY. It supports the default Firestore database
and explicitly named Storage buckets. Standard ascending/descending and array indexes include
Firestore's implicit `__name__` ordering. Field overrides, vector indexes and other extended
index options fail until a reviewed readiness implementation supports them. Unrelated indexes
are not deleted or required to disappear.

Deployment uses the official pinned Firebase CLI with an explicit project and a generated
minimal config. The only possible scopes are `firestore:rules` and `storage`; Storage is an
array with explicit bucket names. There are no caller deploy hooks, index operations, forced
deletions, data migrations, Auth/IAM changes, Hosting or Functions deploys. The config contains
only policy-declared rules, so an absent production Storage bucket can stay absent. Failed
deployment or readback stops the job; no automatic rollback or publication follows.

After successful readback, `receipt` names `firebase-release-<sha256>.json` and
`receipt-sha256` hashes its exact bytes. The artifact contains the source SHA, environment,
project, verification time, ruleset identities/content hashes, and required index keys. It
contains neither credentials nor rules source. Upload fails if the receipt is absent. A receipt
records an observation; it is not a transferable authorization to publish later without a new
live check, an end-user smoke test, or proof of compatibility with every installed client.

## Caller policy

Commit this JSON and adapt paths/project IDs locally. Never pass a project ID from an untrusted
dispatch field or infer it from ambient credentials. Add a production entry deliberately; omit
its Storage rule if that bucket has not been provisioned.

```json
{
  "version": 1,
  "environments": {
    "staging": {
      "project": "example-staging",
      "indexes": "infra/firebase/firestore.indexes.json",
      "rules": [
        { "release": "cloud.firestore", "path": "infra/firebase/firestore.staging.rules" },
        { "release": "firebase.storage/example-staging.firebasestorage.app", "path": "infra/firebase/storage.staging.rules" }
      ]
    }
  }
}
```

## One lock across backend and client publication

Every backend writer and every complete client publication workflow must use the **same**
repository-wide group, with cancellation disabled:

```yaml
concurrency:
  group: firebase-client-release
  cancel-in-progress: false
```

Put it at workflow level when verification and publication occupy separate jobs. Do not release
it after the verifier and before TestFlight/Vercel publication, and do not add the same group to
nested jobs/reusable workflows (that can deadlock). Do not vary it by workflow or environment:
a web deployment may serve both staging and production clients. The action cannot set its caller's
concurrency or environment protection; those are mandatory adoption requirements. GitHub's queue
is not FIFO and supersedes pending work, so a readiness mismatch fails promptly: deploy the backend,
then retry the blocked latest-main client workflow. Console, provider Git integrations and other
out-of-band writers/publication paths must be disabled or separately honor this protocol.

[Backend example](../examples/firebase-release/backend.yml) shows successful main test completions,
manual recovery/production with tests rerun, and protected caller-owned environments.
[Client example](../examples/firebase-release/client.yml) keeps verification and publication under
the same lock. These inert examples require the caller's actual test/publish scripts and policy;
copying them is a separate reviewed activation change.

## Authentication and adoption

Use dedicated scoped CI principals, following architecture §13.1. The deployment principal needs
only the permissions for the declared Firebase rules targets. The verifier needs Rules release/source
read and Firestore index read permissions; broad OAuth scope does not grant IAM permissions.
Keep both JSON credentials in the caller's protected environment, separate from runtime Admin SDK
credentials. The verifier requests a short-lived access token without creating a credential file
or exporting environment variables. The deployer's credential file is confined to its job and is
removed by the official auth action's post-step. No credential is moved to repository scope.

Before activating a consumer: configure main-only environments and production reviewer protection;
provision/validate scoped principals; reconcile actual rules/indexes; prove readback and failure
behavior with synthetic fixtures; connect every publication path to the shared lock. Production
deployment remains a manual, protected-environment operation. Preserve older-client payload/lifecycle
tests and use an expand/ship/contract rollout: exact current-client rule equality does not prove
backward compatibility. A newly changed rule requires a backend deployment and propagation before
the client gate will pass. The ten-minute threshold follows the concrete Evo policy, not a guarantee
that every user's existing connection has refreshed.

Uses [official Firebase deployment tooling](https://firebase.google.com/docs/cli#partial_deploys)
and [Google's auth action](https://github.com/google-github-actions/auth). Node built-ins implement
the small Morpheus-specific source/readiness/receipt policy; there is no new runtime dependency.
