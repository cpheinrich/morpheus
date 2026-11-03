# Reject ISR for repository-backed HQ routes

## Why

Evo's HQ migration review found that the reusable build guard accepted any route present in
Next's prerender manifest. ISR routes are present there too, but may execute a repository loader
again after their revalidation interval, violating the deploy-time-only content contract.

## Changes

- Added `revalidatedStaticRoutes` to the generated HQ build contract.
- Made the postbuild checker reject every declared repository-backed route unless its manifest
  entry records `initialRevalidateSeconds: false`.
- Added a boundary regression using `60`, while the immutable `false` fixture remains green.
- Updated the architecture and website migration runbook, then regenerated `dist/`.

## Verification

- `pnpm vitest run tests/web-scaffold.test.ts` — 33 tests passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm compile` — passed and regenerated the committed distribution.
