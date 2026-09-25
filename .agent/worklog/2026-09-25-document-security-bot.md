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
- Recorded private operations-repository custody, three-gate repository opt-in, and the
  public-but-unlisted registration used across personal and organization accounts.

## Verification

- `pnpm typecheck`
- `pnpm test` — 52 files, 1,394 tests passed
- `pnpm compile`
- `pnpm morpheus pm index` — all indexes unchanged
- `file docs/assets/morpheus-security-badge.png` — 512 x 512 RGBA PNG
- Live App readback: description is general-purpose and Website is
  `https://github.com/cpheinrich/morpheus-security`.

## Dead ends

Brave's ChatGPT extension refused programmatic file selection until local-file access is enabled.
The GitHub form and approved asset remain ready; this does not affect the versioned documentation
asset. A private App owned by `cpheinrich` also could not be installed directly on Evo's
`darwin-health` organization; the user selected a public-but-unlisted registration with explicit
repository selection instead of maintaining one App per account. The initial per-repository-secret
design was replaced before rollout by one protected central credential and scoped installation
tokens. Independent review then identified that public workflow logs and artifacts could disclose
private repository findings, so the schedule, credential, logs, and receipts moved to a separate
private operations repository while the reviewed engine remains public.

## Independent review

The first pass found that the private operations split was not yet documented and that the waiver
description named a branch constraint the implementation does not enforce; both were corrected.
The follow-up cleared the repository content but held delivery until the live GitHub App Website
matched the standalone-repository claim. Chris saved that correction, and authenticated App API
readback now returns the standalone URL and general-purpose description. Reviewer:
`/root/morpheus_docs_reviewer`.
