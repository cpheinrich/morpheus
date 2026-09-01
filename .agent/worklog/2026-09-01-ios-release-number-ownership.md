# iOS release number ownership — 2026-09-01

## Problem

The reusable nightly TestFlight workflow used `github.run_id` as `CFBundleVersion`. The value was
collision-proof but unrelated to the app's version-specific build sequence and produced enormous
user-visible build numbers.

## Resolution

- Removed the shared `BUILD_NUMBER` injection.
- Made App Store Connect app and beta-group identifiers explicit caller inputs.
- Installed `asccli` before the protected release step so caller scripts can allocate and
  distribute without exposing credentials to package installation.
- Kept archive, numbering, processing, and assignment behavior in the caller-owned upload script.

## Validation

- `vitest run` — 37 files, 1,046 tests passed
- `tsc --noEmit` — passed
- `morpheus check pr` — pending PR metadata
