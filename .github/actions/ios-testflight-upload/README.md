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
