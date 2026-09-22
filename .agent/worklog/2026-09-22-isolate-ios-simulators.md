---
roadmap: MO-26-09-16-04.21.12
date: 2026-09-22
agent: codex
outcome: in-progress
---

# Owned iOS simulator destinations

Issue #249: CI and a serial release gate selected one shared base device. The incident proves
shutdown, but does not identify the requester. Current workflow source contains no explicit
simctl shutdown/clone; Xcode manages parallel clone preparation internally. Avoid claiming a
specific unseen Xcode call as the proven original cause.

Each test job now creates a fresh device of the requested type/runtime and passes its UUID to
both test phases. Using create instead of cloning a shared device avoids a booted source dependency.
Name/OS/latest, explicit id and arch are supported; invalid or unavailable selectors fail closed.
Cleanup runs after artifact collection on success, failure or cancellation and addresses only the
owned UUID. Other platforms and build-only jobs are unchanged. Hard-killed runners may leave
orphans; there is no global simulator shutdown or deletion.

This is a small, simulator-specific use of Apple's existing simctl and Python's standard JSON
library, not a generic device manager or new dependency. Apple's command reference and installed
Xcode 26.6 simctl help confirm create accepts a type and runtime.

## Validation

- Red-before-green workflow regressions: four failures on the original workflow, then all five
  lifecycle tests pass. Real subprocesses exercise independent allocations, cleanup while another
  lane stays live, explicit booted-id selection, OS/latest/arch, invalid selectors and create failure.
- All 143 focused workflow tests and typecheck pass; actionlint 1.7.12 validates the workflow.
- Native local macOS / Xcode 26.6 / iOS 26.5 test at 2026-09-22 08:51–08:53 UTC: two owned
  iPhone 17 Pro Max devices booted together. While the serial device stayed booted, the other base
  was shut down and cloned, its clone booted, and that base deleted. launchctl probes succeeded on
  the serial device after both transitions and on the clone after base deletion. All three owned
  devices were then deleted. Evidence: local/issue-triage/ios249-native.json in the canonical clone.
- This is a native CoreSimulator lifecycle test, not two full XCTest lanes. The incident Mac mini's
  SSH authentication is unavailable from this device and through the existing codex-pro connection.
  Its roadmap explicitly requires deliberate overlap there before closure, so keep this PR open
  and auto-merge disabled pending that acceptance evidence. No production upload was triggered.
- Graph bootstrap verified this exact checkout at a124cdc, but the MCP transport then closed.
  search_graph and check_index_coverage both failed; direct source reads covered the entire modified
  workflow and relevant test/architecture sections. No graph completeness claim is made.

## Independent review

Pending. Preserve the Mac mini acceptance hold even if source review and CI pass.
