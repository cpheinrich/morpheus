---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.37.24
outcome: review
summary: Support distinct production build identity in iOS QA modes and verify the built bundle before installation.
---

# iOS QA mode build identity

Morpheus #388 arose when Evo needed production QA but the shared preview's
single build command, product path and bundle ID still selected staging. Evo
could only proceed by temporarily replacing its QA configuration in an
isolated checkout.

The preview now accepts all three fields on a mode. It rejects partial
overrides, so changing just the bundle ID cannot silently reuse a staging
product. It reads the built app's `CFBundleIdentifier` before install,
including when `--no-build` selects an existing product. Status and stop
identify the mode and bundle recorded at start. The shared simulator, lease
and overlay lifecycle is unchanged.

Focused validation: `pnpm exec vitest run tests/qa-preview.test.ts
tests/qa-comments.test.ts` passed 73 tests, covering config validation,
production selection, bundle mismatch refusal, reporting and the direct QA
comments dependent. `pnpm typecheck`, `pnpm lint`, `pnpm compile`, and
`pnpm morpheus pm index` passed. No local full suite was run because this
change is confined to the QA preview path; CI runs it on the PR.

Codebase-memory could not activate because active sessions could not be
stopped safely. I used targeted source and test inspection instead.

The independent reviewer cleared the normal-risk change with no findings. They checked config validation, the selected build and launch path, the pre-install bundle check, saved mode reporting, older state compatibility and generated output. A live simulator run was unavailable in this Morpheus checkout; CI remains the final test gate.

The independent reviewer cleared the iOS QA mode identity change with no findings; live simulator operation was not exercised in this checkout.

```morpheus-review
{
  "version": 2,
  "base": "53282527e3d92944ea9092f01a9603ef54dadd1f",
  "reviewed": "e3ea0c8fb5c700bf1c9f099ece08cc3c78f5a327",
  "covered": "e3ea0c8fb5c700bf1c9f099ece08cc3c78f5a327",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/ios_mode_review",
  "risk": "normal",
  "elapsedMinutes": 1.2,
  "timing": {
    "source": "clock",
    "durationMs": 72000,
    "evidence": "clock__curr_time: reviewer dispatched 2026-10-15 07:40:56 UTC; completion observed 07:42:08 UTC"
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the iOS QA mode identity change with no findings; live simulator operation was not exercised in this checkout.",
  "findings": []
}
```
