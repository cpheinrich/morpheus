---
roadmap: MO-26-09-25-09.58.45
created: 2026-09-25
updated: 2026-09-25
---

# Publish Morpheus Security bot identity and operator guide

## Outcome

- Added the approved 512 px Morpheus Security badge as the canonical GitHub App identity asset.
- Made the standalone `cpheinrich/morpheus-security` execution contract discoverable from
  `architecture.md` and `docs/README.md`.
- Added a one-page policy summary, exact least-privilege App permissions, adoption steps, and the
  post-merge clean-run acceptance rule.
- Recorded central private-key custody, three-gate repository opt-in, and the public-but-unlisted
  registration used across personal and organization accounts.

## Verification

- `pnpm typecheck`
- `pnpm test` — 52 files, 1,394 tests passed
- `pnpm compile`
- `pnpm morpheus pm index` — all indexes unchanged
- `file docs/assets/morpheus-security-badge.png` — 512 x 512 RGBA PNG

## Dead ends

Brave's ChatGPT extension refused programmatic file selection until local-file access is enabled.
The GitHub form and approved asset remain ready; this does not affect the versioned documentation
asset. A private App owned by `cpheinrich` also could not be installed directly on Evo's
`darwin-health` organization; the user selected a public-but-unlisted registration with explicit
repository selection instead of maintaining one App per account. The initial per-repository-secret
design was replaced before rollout by one protected central credential and scoped installation
tokens.

## Independent review

Pending.
