---
agent: codex
date: 2026-09-25
roadmap: MO-26-09-25-06.45.22
outcome: review
---

# Owned CI simulators

Evo's Pro had seven abandoned QA devices. Its local repair belongs in Evo; the additional
CI/nightly audit found both use this reusable workflow, which never shuts down or deletes
simulators. Filed #266. Added a zero-dependency Node action with ownership saved before
creation and an unconditional post hook. Build/test use the exact generated UDID; cleanup
matches only the unique base name and XCTest's numbered clone names, continues across
individual errors, and fails visibly. Existing user devices are never mutated.

The Mac mini's github-runner account was executing a nightly test gate, with its existing
Pro Max booted. Zoe's separate account has its own simulator. Read-only audit distinguished
them; no active runner was stopped. The nightly watchdog only dispatches/queries GitHub,
the archive action targets physical iOS and already cleans signing material, and the
visual-QA publisher runs on Linux. Hard kills that skip post hooks require exact-owner
recovery, documented in the runbook; no global sweeper is installed.

## Validation

- `node --test .github/actions/ios-simulator/simulator.test.mjs`: 6 passing behavior tests.
- `pnpm typecheck && pnpm test && pnpm compile`: passed; 50 files / 1,381 tests.
- Native Mac mini smoke under github-runner creates/boots an owned device, adds a worker-name
  device, invokes cleanup twice, and checks pre-existing booted simulators remain untouched.
- Source/config fallback used because graph MCP was not exposed. Scope: shared ios-ci,
  ios-nightly-build, ios-visual-qa and ios-testflight-upload; no graph completeness claims.
