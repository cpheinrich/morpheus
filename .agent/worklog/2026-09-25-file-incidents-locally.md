# MO-26-09-25-14.43.18 — File incidents locally

## Outcome

- Removed Morpheus's `incidentRepository` override so malware incident issues are filed in this
  repository by the shared Morpheus Security engine.
- Kept the required-check allowlist and narrow bot review waiver unchanged.

## Verification

- Parsed `.github/morpheus-security.json` as JSON.
- `morpheus pm index`
- `morpheus pm validate`
- `pnpm typecheck`
- `pnpm test` — 51 files, 1,386 tests passed

## Independent review

Pending.
