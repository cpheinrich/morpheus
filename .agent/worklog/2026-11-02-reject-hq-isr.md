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

## Independent review

The independent reviewer cleared the normal-risk change with no findings after independently verifying the ISR boundary, generated-route coverage, compiled output, documentation, and the 33-test focused suite.

```morpheus-review
{
  "version": 2,
  "base": "a5933ad38a92f8ae16d02468545c161d898532ab",
  "reviewed": "653826375fe47d67a361e43db4bbb94d4888800a",
  "covered": "653826375fe47d67a361e43db4bbb94d4888800a",
  "authorSession": "01a19f40-6bee-7aa1-bf04-dd2abaaf6991",
  "reviewerSession": "/root/morpheus_hq_isr_review",
  "risk": "normal",
  "elapsedMinutes": 0.6696166666666667,
  "timing": {
    "source": "clock",
    "durationMs": 40177,
    "evidence": "Clock readings around reviewer turn /root/morpheus_hq_isr_review: 1793684438212 ms to 1793684478389 ms."
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the normal-risk change with no findings after independently verifying the ISR boundary, generated-route coverage, compiled output, documentation, and the 33-test focused suite.",
  "findings": []
}
```
