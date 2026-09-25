---
roadmap: MO-26-09-25-09.58.45
created: 2026-09-25
updated: 2026-09-25
---

# Publish Morpheus Security bot identity and operator guide

## Outcome

- Added the approved 512 px Morpheus Security badge as the canonical GitHub App identity asset.
- Made the existing security-remediation execution contract discoverable from `docs/README.md`.
- Added a one-page policy summary, exact least-privilege App permissions, adoption steps, and the
  post-merge clean-run acceptance rule.
- Recorded GitHub's account boundary for private App registrations after a prepared install for
  the `darwin-health` organization returned 404 despite the operator being an organization admin.

## Verification

- `pnpm typecheck`
- `pnpm test` — 52 files, 1,394 tests passed
- `pnpm compile`
- `pnpm morpheus pm index` — all indexes unchanged
- `file docs/assets/morpheus-security-badge.png` — 512 x 512 RGBA PNG

## Dead ends

Brave's ChatGPT extension refused programmatic file selection until local-file access is enabled.
The GitHub form and approved asset remain ready; this does not affect the versioned documentation
asset. A private App owned by `cpheinrich` also cannot be installed directly on Evo's
`darwin-health` organization, so that rollout requires an explicit ownership choice.

## Independent review

Pending.
