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
beta review. `acceptance-artifact-name` names the artifact; it contains only repository,
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
