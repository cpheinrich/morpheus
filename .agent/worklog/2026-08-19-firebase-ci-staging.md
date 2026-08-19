---
agent: claude
date: 2026-08-19
roadmap: MO-26-08-19-00.30.22
outcome: shipped
summary: Lifted Evo's Firebase emulator CI as a reusable workflow; manifest gains the staging pair.
---

# Reusable Firebase emulator CI and staging manifest fields

First slice of cpheinrich/morpheus#135 — lifting Evo's consumer-auth work upstream. This slice is
the part that is immediately useful to any Firebase project: the CI workflow and the manifest
fields the later scaffold will read.

## What was done

- `.github/workflows/firebase-tests.yml`: Evo's standalone workflow generalised to
  `on: workflow_call`. Inputs for the app directory (`working-directory`), the two root script
  names (`emulator-script`, `test:emulator`; `e2e-script`, `test:e2e`), `run-e2e` for projects
  without a Playwright suite yet, `build-tokens`, and the two pins (`firebase-tools-version` 15,
  `java-version` 21). Every hard-won comment kept: the JDK pin only fails in CI, the jar cache is
  keyed on `firebase.json`, the browser cache on the lockfile, `emulators:exec` over a
  start/wait/kill trio, traces uploaded on failure. Deliberately not folded into `web-ci.yml`.
- `ProjectManifest` gains `stagingDomain` (same origin shape as `publicDomain`, one shared
  refinement so the two cannot drift) and documents the `accounts.gcpProjectStaging` /
  `accounts.firebaseStaging` convention. `architecture.md` §13.2 records the two-project,
  staging-as-default policy; §4's example shows the field; §18.2 says why the workflow is opt-in.

## Learned / notes

- Evo's own workflow installs Playwright with `pnpm --filter @evo/web exec`; the reusable form uses
  `working-directory` + `pnpm exec` so it needs no package name as an input.
- Evo's `test:emulator` wraps `emulators:exec --project cph-evo` (prod id) while `test:e2e` uses
  the staging id — the id only matters for E2E, where it must match what the client bundle
  resolves. The workflow stays agnostic: the ids live in the calling repo's package.json scripts.
