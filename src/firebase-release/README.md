# Firebase release boundary

Node-only code used by the caller-owned `firebase-release` composite action; no application
dependencies or ambient project/credential selection. The caller keeps project policy and the
whole-publication concurrency lock. See [the runbook](../../docs/runbooks/firebase-releases.md).
