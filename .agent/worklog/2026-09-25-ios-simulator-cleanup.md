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

## Independent review

Independent reviewer cleared the shared CI simulator action with no findings. Six focused tests passed; ownership, pre-creation state and unconditional post cleanup were checked. Native Mac mini smoke passed under github-runner. The reviewer did not independently reproduce native XCTest worker creation or GitHub cancellation; hard termination recovery remains documented.

```morpheus-review
{
  "version": 1,
  "base": "92f3e627920e8ff1cc8d1d591f9ea89c422e1fe6",
  "reviewed": "4816516229cfc6053cde36b68cd434e2f99b0b14",
  "covered": "4816516229cfc6053cde36b68cd434e2f99b0b14",
  "authorSession": "01a0d8cb-5b59-7261-978f-19fd9976dc80",
  "reviewerSession": "01a0d8d9-5453-7d50-90e2-0e1b02594d88",
  "risk": "high",
  "elapsedMinutes": 6,
  "outcome": "complete",
  "summary": "Independent reviewer cleared the shared CI simulator action with no findings. Six focused tests passed; ownership, pre-creation state and unconditional post cleanup were checked. Native Mac mini smoke passed under github-runner. The reviewer did not independently reproduce native XCTest worker creation or GitHub cancellation; hard termination recovery remains documented.",
  "findings": []
}
```
