# Same-account signing

The action changes the macOS user's keychain search list/default and installs a provisioning
profile. All releases using this action under the same operating-system account share one
kernel file lock, acquired before the upload script starts and held through its EXIT cleanup.
Separate repository concurrency groups or runner temporary directories do not isolate that state.

`signing-lock-timeout-seconds` defaults to 600 (allowed range 1–3600). The wait counts toward the
caller job timeout and fails without starting the upload script when exhausted. The lock uses
the account's canonical home directory, independent of a runner's HOME/TMPDIR overrides. It is
inherited across exec and by shell children; the kernel releases it after the last holder exits.
The persistent lock file must never be deleted to recover a busy release: unlinking creates a
second lock domain while existing waiters still hold the first inode.

Use the composite action, not `upload-testflight.sh` directly. Older pinned action versions and
other signing tools do not participate. Keep a host-wide job lease until every signing lane uses
the new action; it is compatible with this lock. A hard kill may prevent keychain/profile cleanup,
so inspect that state before retrying a forcibly terminated release. The lock prevents overlap;
it does not repair artifacts left by a killed process. See architecture.md's iOS release contract.


## Scheme and configuration

`scheme` accepts spaces, such as `Evo Production`. `configuration` defaults to `Release` and
selects the configuration for both build-settings queries and the archive. Set it explicitly
when the shared scheme's Archive action uses another configuration, for example:

```yaml
with:
  scheme: Evo Production
  configuration: Production
```

Names must be non-blank single-line values. Spaces are preserved as part of one Xcode argument;
CR/LF are refused before writing the job environment. The working-directory/project restrictions
are unchanged. `archive-build-settings` still supplies explicit per-setting overrides.

## Upload acceptance receipts

After Apple returns a successful upload response with one upload id, the action writes
`accepted.json` and uploads it **before** polling processing, assigning groups or submitting
beta review. `acceptance-artifact-name` names the artifact; its allowlisted receipts contain only repository,
checked-out source SHA, run id/attempt/job, bundle/app ids, version/build number, upload id,
acceptance timestamp and schema/state fields. No raw API response, keys or signing files enter it.
The artifact name includes the run and attempt plus a unique invocation suffix for matrix jobs
and multiple apps. Artifacts never overwrite each other and are retained for 90 days (subject
to the repository's retention cap). Consumers needing a longer cursor must preserve the receipt.

Acceptance requires an unambiguous upload id, no API errors, and the pinned asccli state
`PROCESSING` or `COMPLETE`. `AWAITING_UPLOAD` is polled up to the existing processing timeout;
absent, failed or unknown states remain uncertain. Acceptance does not mean a VALID processed
build or tester availability.
A later distribution failure still fails the action while retaining this receipt. Artifact
persistence failure blocks distribution. A pre-upload failure creates no accepted receipt;
missing, malformed or ambiguous responses do not become acceptance. **No receipt is not proof
that no upload occurred:** a killed runner or lost API/artifact response can leave acceptance
unknown. Consumers must keep that case uncertain and inspect all run attempts, including
receipts from an earlier successful upload followed by a failed rerun. Existing step-conclusion
consumers do not automatically adopt the receipt contract.

Automatic build numbers also respect a persistent per-app/version reservation under the
account signing lock, because Apple's builds collection may lag an accepted upload. Reservations
live in the account's `Library/Caches/morpheus/testflight-build-numbers` directory, use only
hashed app/version keys and numbers, and intentionally permit gaps after failed runs. Explicit
caller build numbers retain their meaning and raise the automatic floor. Do not remove this
state while releases are active or accepted uploads remain absent from Apple's builds list.
The lock and reservation cover one macOS account; callers spanning machines still need their
own release concurrency boundary.

## Durable CD execution

The reusable `ios-ci.yml` accepts `source-sha` (an exact lowercase 40-character commit)
and `execution-id` (the durable dispatch effect id). A CD execution requires both; the
workflow checks out and asserts that source, isolates its concurrency by execution id,
and disables cancellation. Legacy PR callers retain cancellation by ref. Complete test
artifacts for CD are named `ios-test-evidence-<execution-id>` and contain
`Results/execution.json` with the actual checked-out `sourceSha`, `executionId`, string
`runId` and `runAttempt`. This metadata accompanies real xcresult exports and the caller's
inventory/validation evidence; it does not assert that the tests passed.

The upload action accepts `reserved-build-number`, `before-upload-script`,
`after-upload-script`, and `distribution-enabled` (default `true`). A globally reserved
number requires both hooks and cannot be combined with `BUILD_NUMBER`. It stays exact
while raising the legacy account-local automatic floor; the durable controller owns
cross-host reservation and provider reconciliation.

Hooks are trusted executable repository-relative paths, resolved inside `GITHUB_WORKSPACE`
(including through symlinks). A separate trusted `control/` checkout can supply the hook
while app source remains at the workspace root. Hooks run there, inheriting the calling
job's CD identity and ledger credentials. The before executable receives `before`, then
`resource`; the after executable receives `after`. A thin wrapper can call:

```sh
node "$GITHUB_WORKSPACE/tooling/dist/cli/index.js" cd upload-hook \
  --phase "$1" --config "$GITHUB_WORKSPACE/control/.morpheus/cd.json"
```

After every existing IPA verification, the adapter exports `IPA_SHA256`, `MARKETING_VERSION`,
`BUILD_NUMBER`, and `ASC_APP_ID`, then calls `before` to atomically claim upload. The caller
supplies `MORPHEUS_CD_INTENT_ID`, `MORPHEUS_CD_ATTEMPT_ID`,
`MORPHEUS_CD_DISPATCH_EFFECT_ID`, `MORPHEUS_CD_SOURCE_SHA`, and
`MORPHEUS_CD_CONTROL_SHA`; source and run identity are checked against the actual checkout
and prepared context. Exit 0 authorizes the new upload, 3 safely skips an already claimed,
accepted or uncertain operation without inventing acceptance, and other statuses fail.
A second digest check refuses an IPA changed by a hook.

As soon as Apple returns an upload resource, `resource` receives `UPLOAD_RECEIPT_PATH`
pointing to allowlisted `resource.json`, before acceptance polling. It contains the exact
identity, IPA digest, upload id and provider state; terminal failures retain bounded
machine diagnostic codes. Unknown states remain uncertain. The adapter publishes `accepted.json` and step outputs immediately when either the initial
response or acceptance poll reports `PROCESSING`/`COMPLETE`, before calling the `resource`
hook. The `after` hook then receives `accepted.json`. Either hook may fail the job without
hiding known acceptance from the `always()` artifact step. That artifact includes only
`accepted.json` and `resource.json`, never the surrounding context or raw responses.
If only an awaiting/failed/unknown resource was observed, `resource-path` still enables
artifact publication when a ledger hook is unavailable, without inventing acceptance. No raw provider response is published.
`acceptance-path`, `version`, `build-number`, `upload-id` and `acceptance-artifact-name`
expose the resulting evidence. A skipped claim produces no accepted receipt or upload id.

Set `distribution-enabled: "false"` for the durable controller to own processing and
internal promotion. This skips all action-side distribution and external beta review;
acceptance remains distinct from delivery. The protected caller job still owns all signing
secrets. Legacy releases require workflow ref `refs/heads/main`. CD V2 may instead use only
`refs/tags/morpheus-cd-control-<control-sha>` where `MORPHEUS_CD_CONTROL_SHA` is an exact
lowercase 40-character SHA and equals `GITHUB_SHA`. The exception also requires exact source
SHA, complete intent/attempt/dispatch identity, both trusted hooks, a reserved build number,
and disabled action-side distribution. Arbitrary tags and branch refs remain refused.
The existing hook/source/claim checks still run before upload; the tag alone grants nothing.
