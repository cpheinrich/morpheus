---
agent: codex
date: 2026-09-01
roadmap: MO-26-09-01-19.16.43
outcome: review
---

# Forward Firebase-backed tests through nightly iOS builds

## What changed

- Forwarded the existing `ios-ci` parallel-test, Firebase emulator, and pre-test-script contract
  through `nightly-ios-build` so release tests match ordinary CI.
- Added a protected upload-step seam for a caller-owned Google service plist without exposing it to
  change detection, preflight, tests, checkout validation, or tool installation.
- Documented the ownership boundary and added parsed-workflow regression coverage.

## Verification

- Workflow suite: 100 tests passed.
- Full suite: 37 files and 1,046 tests passed.
- TypeScript typecheck and compile passed; committed `dist/` stayed current.
- `pnpm lint` could not run because the repository declares the script but does not install
  `eslint`; no lint dependency was added as an unrelated side effect.
