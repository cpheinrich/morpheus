---
agent: codex
date: 2026-08-24
roadmap: MO-26-08-24-17.58.40
outcome: complete
---

# Use Node 24 actions in iOS CI

## Trigger

Kairos's first hosted reusable iOS run passed in 12m30s, but the runner annotated checkout, cache,
setup-java, and upload-artifact because their configured majors used deprecated Node 20. GitHub also
stated that setup-java v4 is deprecated.

## Changes

- Updated the reusable workflow to the current official majors: checkout v7, cache v6, setup-java
  v6, and upload-artifact v7.
- Confirmed each current major's checked-in `action.yml` declares the Node 24 runtime.
- Preserved `persist-credentials: false`, cache keys, Java distribution/version, artifact paths,
  retention, and conditional behavior.
- Added a workflow contract assertion so a future edit cannot silently restore a deprecated major.

## Verification

- GitHub Releases API: checkout v7.0.1, cache v6.1.0, setup-java v6.0.0, upload-artifact v7.0.1
- Each official major tag's `action.yml`: `runs.using` is Node 24
- `pnpm typecheck`
- `pnpm compile`
- `pnpm vitest run tests/workflows.test.ts --maxWorkers=1` — 92 tests passed
- `pnpm vitest run --maxWorkers=1` — 979 tests passed
- `pnpm morpheus pm index`
- `pnpm morpheus pm validate`
- `actionlint` 1.7.7 and `git diff --check`

The Firebase-backed Kairos caller must run again after this reaches `main`; that hosted run is the
compatibility proof for the exact actions, runner, Xcode, simulator, emulators, and XCTest suite.

## Open questions

None.
