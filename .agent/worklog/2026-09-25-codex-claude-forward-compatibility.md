# codex-claude forward compatibility

## Problem

The first install on Codex Desktop 0.157 failed during `doctor` and `inspect` because the
detached-task transcript and memory adapters accepted only two exact 0.154 version strings.
The current runtime retained every field and database column the adapters use.

## Work

- Replaced transcript version gating with validation of the active turn settings contract,
  freshness, and unrestricted permission invariants.
- Replaced memory version gating with a read-only schema check for `threads.memory_mode`.
- Added future-version and missing-contract regression coverage.
- Updated the documented compatibility boundary.

## Verification

- `pnpm check`
- `pnpm test` — 24 tests passed
- Installed the branch package and ran `doctor` against the active Codex Desktop task;
  transcript settings and Claude Max authentication were detected.
- Ran `inspect` against the active task; unrestricted settings and explicit Claude routing
  were returned successfully.
- Reinstalled while the idle bridge was running, then ran `inspect` again; the installation
  handshake retired the stale service and the new service answered successfully.
