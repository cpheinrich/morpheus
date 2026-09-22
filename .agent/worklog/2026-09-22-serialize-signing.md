---
roadmap: MO-26-09-16-04.21.13
date: 2026-09-22
agent: codex
outcome: in-progress
---

# Serialize same-account signing

Issue #251: two repository runners in one macOS account can snapshot different keychain state,
then restore over each other. Workflow concurrency is scoped to a repository and does not protect
this resource. The existing host job lease is a mitigation and is left intact.

The composite action now enters the complete upload script under a canonical account-wide kernel
flock. Acquisition precedes any script snapshot or mutation. An inheritable descriptor crosses
exec into the shell and its children, holding the lease through EXIT cleanup and surviving a
parent killed while a child remains. The file is never removed, so waiters cannot split into two
inode domains. Timeout is bounded to 1–3600 seconds, default600; failures enter no signing code.
The account's passwd home owns the path rather than mutable HOME/RUNNER_TEMP. No credentials are
read or emitted by the lock, and no signing/export semantics change.

The script already documents that Tahoe exporter discovery depends on the user's keychain domain.
Isolation from the global search list remains unverified on the mini, so choose serialization
instead of changing identity discovery. The existing host lease must remain until all lanes run
this action; older pins and unrelated signing tools are outside its lock contract. Hard-kill
artifact recovery is still an operator inspection, not a stale-lock deletion.

Build/borrow: filelock4.0.1 is maintained (PyPI release2026-09-19, zero required runtime deps), but
this small exec/descriptor boundary is implemented with existing Python fcntl/os/pwd primitives;
no package installation enters the credentialed action. Sources: https://pypi.org/project/filelock/
and https://docs.python.org/3/library/fcntl.html.

## Validation

- Native macOS process suite: nine tests cover overlapping signers restoring shared synthetic state
  before the next snapshot, exact event ordering, timeout without mutation, failure cleanup,
  canceled waiter, owner TERM cleanup, parent SIGKILL with a surviving child, account path stability,
  symlink refusal and invalid timeout boundaries. No real keychain or release credentials used.
- Deleting the flock acquisition makes the suite fail, proving the concurrency guard is exercised.
- The workflow test asserts the composite action actually invokes the wrapper and forwards timeout.
- Frozen install, typecheck, all 1,363 repository tests (including the nine native process cases),
  lint, compilation, PM index and inbox validation passed. No upload/deployment activated.
- Exact-checkout graph bootstrap succeeded; parent MCP search/coverage calls returned Transport
  closed. Direct source fallback covered wrapper, action, upload-script keychain lifecycle and tests.

## Independent review

Pending; no clearance or auto-merge is asserted.
