---
agent: codex
date: 2026-08-24
roadmap: MO-26-08-24-17.26.43
outcome: complete
---

# Support Firebase-backed iOS CI consumers

## Changes

- Added an opt-in Firebase Auth/Firestore emulator boundary to the reusable native iOS workflow,
  with an exact `firebase-tools` version, Java 21, an explicit synthetic project id, and validated
  repository config and emulator inputs.
- Added one validated repository-relative pre-test script hook. When emulators are enabled it runs
  after Firebase publishes the emulator environment and before XCTest, which supports deterministic
  fixture seeding without a separately managed service race.
- Defaulted parallel testing off, disabled automatic SwiftPM resolution after the explicit locked
  resolve, retained rendered XCTest attachments independently from failure evidence, and made the
  bounded job duration configurable for larger UI suites.
- Disabled checkout credential persistence before any caller-controlled build phase or fixture
  runs, and included Firebase's debug log in emulator failure evidence.
- Documented the caller contract and added workflow tests for its disabled defaults, conditional
  setup, command boundary, package lock, and artifact behavior.

## Security boundary

The emulator mode remains disabled by default and needs no credential. Repository paths, the exact
CLI version, synthetic project id, and emulator list are validated before setup. Dynamic Xcode
arguments remain a shell array; the command passed through `firebase emulators:exec` is generated
with shell escaping rather than interpolating caller text as source.

## Verification

- `pnpm typecheck`
- `pnpm compile`
- `pnpm vitest run tests/workflows.test.ts --maxWorkers=1` — 91 tests passed
- `pnpm vitest run --maxWorkers=1` — 978 tests passed
- `pnpm morpheus pm index` — every index unchanged/current
- `pnpm morpheus pm validate` — 120 roadmap items, one goal, zero requests valid
- `actionlint` 1.7.7 and `git diff --check`

Morpheus has no Xcode project. The first hosted end-to-end consumer run follows after this reusable
contract reaches `main`, using Kairos's Firebase-backed unit and UI test suite; Evo's non-Firebase
caller already keeps the default service mode disabled.

## Build vs. borrow

No new generic module or action was needed. The existing decision to select Xcode directly rather
than add `maxim-lobanov/setup-xcode` remains in force. Firebase's own locked CLI is the service
runner because it owns emulator lifecycle and environment injection.

## Open questions

None.
