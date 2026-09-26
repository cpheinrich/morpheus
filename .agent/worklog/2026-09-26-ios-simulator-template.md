---
agent: codex
date: 2026-09-26
roadmap: MO-26-09-26-08.10.36
outcome: review
---

# Warmed iOS CI simulator template

Evo's iOS timing audit linked the jump from roughly 32-minute to 130-minute test steps to two
changes. Serial testing explains about 18 minutes; the remaining regression begins with Morpheus
#267 creating a pristine simulator per job. Across the same 108 UI methods, aggregate case time
rose from 2,985.2 seconds to 5,734.6 seconds. A near-controlled three-method sample with unchanged
app/test code and parallelism rose from 185.4 seconds to 427.8 seconds. Filed #283.

The shared action now uses GitHub's documented `runner.environment` boundary. Ephemeral hosted
runners still create a pristine job device. Persistent self-hosted runners keep one deterministic,
dedicated template per active device/runtime, finish its first boot once, leave it shut down and
clone the existing uniquely named job destination from it. A marker invalidates incomplete warm-up
and Xcode-toolchain changes. A per-user BSD kernel lock serializes two runner slots and releases
automatically when its process exits. Superseded owned templates are removed under that lock, so
runtime upgrades do not accumulate another permanent device.

Tests never run on the template. The existing unconditional post action continues to delete the
job clone and its default/testing-set XCTest workers. It also locks and shuts down the exact
template after an interrupted setup. User simulators and unrelated job devices remain outside the
template and cleanup name contracts.

Considered `proper-lockfile` 4.1.2 (three dependencies) and `lockfile` 1.0.4 (one dependency).
Both were last published in June 2022. The action uses macOS's built-in `lockf` instead of adding
either unmaintained package to every iOS CI action checkout.

The initial independent review found two substantive races in that directory-lock implementation:
it could evict a live owner after five minutes, and two stale-lock reclaimers could delete each
other's newly acquired lock. Both findings were accepted. The correction delegates exclusion to
macOS `lockf -k`, which never breaks another process's live BSD lock, keeps one stable lock file for
ordered waiters, and releases the kernel lock when the owner exits or is killed. A native
two-process test proves critical sections do not interleave and that a crash does not block the
next owner.

## Validation

- `node --test .github/actions/ios-simulator/simulator.test.mjs`: 18 focused behavior tests pass,
  including native concurrent lock ownership and crash release on macOS.
- `pnpm typecheck`, `pnpm test` (51 files / 1,386 tests), and `pnpm compile`: pass.
- GitHub's official context and action-command references confirm `runner.environment` distinguishes
  `self-hosted` from `github-hosted`, action inputs become `INPUT_*`, and main-action state becomes
  `STATE_*` only for that action's post phase.
- Native MacBook Pro smoke against the real iOS 26.5 runtime: initial template warm plus clone took
  28.27s and the clone booted in 3.50s; the next clone took 3.80s and booted in 4.14s. Both job
  clones were deleted, the original destination remained, and exactly one template remained shut
  down. A shut-down template has disk state but no running simulator process holding RAM.
- Codebase-memory operational check produced no graph tools in this Codex session; exact source
  and workflow files were read directly. Scope is the shared iOS simulator action and workflow.

## Independent review

The high-risk independent review found two substantive races in the first directory-lock design.
Both were accepted and fixed by replacing the lease with macOS's process-owned kernel lock. The
same reviewer cleared the correction after the 18-test focused suite, including native concurrent
ownership and crash release, passed. No findings remain open.

```morpheus-review
{
  "version": 1,
  "base": "780bc29254efd6e64cfc82a9f2727460c2d87dcf",
  "reviewed": "79d9a8c1fc0c8660a618a55afd5dc6d91d88dea0",
  "covered": "fa2be28b9491ea3a57e733fcbbd78e2b33d367fd",
  "authorSession": "01a0de01-e47d-74d1-83ef-f6a9e6543155",
  "reviewerSession": "01a0de50-a21f-7f60-9037-ab9c42e983fc",
  "risk": "high",
  "elapsedMinutes": 12,
  "outcome": "complete",
  "summary": "High-risk review found two substantive races in the first directory-lock design. Both were accepted and fixed with macOS process-owned kernel locking; the same reviewer cleared fa2be28 after the 18-test focused suite passed, including native concurrency and crash release. No findings remain open.",
  "findings": [
    {
      "id": "IOS-LOCK-1",
      "severity": "substantive",
      "description": "The timestamp lease could evict a live owner after five minutes even though template work can legitimately span several individually bounded simctl calls.",
      "paths": [".github/actions/ios-simulator/simulator.mjs", ".github/actions/ios-simulator/simulator.test.mjs"],
      "disposition": "fixed",
      "response": "Removed timestamp and PID eviction. lockf never breaks a live BSD lock; a waiter times out without running the helper."
    },
    {
      "id": "IOS-LOCK-2",
      "severity": "substantive",
      "description": "Two stale-lock reclaimers could both remove and replace the same directory, allowing one to delete the other's live lock and enter concurrently.",
      "paths": [".github/actions/ios-simulator/simulator.mjs", ".github/actions/ios-simulator/simulator.test.mjs", ".github/actions/ios-simulator/post.mjs", ".github/actions/ios-simulator/locked.mjs"],
      "disposition": "fixed",
      "response": "Removed directory reclamation. lockf -k keeps one stable file while the kernel arbitrates ownership; a native two-owner and crash-release test covers the failure mode."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a0de50-a21f-7f60-9037-ab9c42e983fc",
      "commit": "fa2be28b9491ea3a57e733fcbbd78e2b33d367fd",
      "outcome": "cleared",
      "elapsedMinutes": 5,
      "summary": "Cleared IOS-LOCK-1 and IOS-LOCK-2 at fa2be28 after confirming kernel ownership replaces deletion-based reclamation, both main and post use the same lock, and the native concurrency/crash test passes; no new findings."
    }
  ]
}
```
