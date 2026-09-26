---
agent: codex
date: 2026-09-26
roadmap: MO-26-09-26-08.10.36
outcome: in-progress
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
and Xcode-toolchain changes. A per-user atomic directory lock serializes two runner slots and
reclaims an owner whose process died. Superseded owned templates are removed under that lock, so
runtime upgrades do not accumulate another permanent device.

Tests never run on the template. The existing unconditional post action continues to delete the
job clone and its default/testing-set XCTest workers. It also locks and shuts down the exact
template after an interrupted setup. User simulators and unrelated job devices remain outside the
template and cleanup name contracts.

Considered `proper-lockfile` 4.1.2 (three dependencies) and `lockfile` 1.0.4 (one dependency).
Both were last published in June 2022. The action uses a small atomic-directory lock with Node
built-ins instead of adding either unmaintained package to every iOS CI action checkout.

## Validation

- `node --test .github/actions/ios-simulator/simulator.test.mjs`: 17 focused behavior tests pass.
- `pnpm typecheck`, `pnpm test` (51 files / 1,386 tests), and `pnpm compile`: pass.
- GitHub's official context and action-command references confirm `runner.environment` distinguishes
  `self-hosted` from `github-hosted`, action inputs become `INPUT_*`, and main-action state becomes
  `STATE_*` only for that action's post phase.
- Native self-hosted clone/boot timing: pending the currently active iOS CI job on the MacBook Pro.
- Codebase-memory operational check produced no graph tools in this Codex session; exact source
  and workflow files were read directly. Scope is the shared iOS simulator action and workflow.

## Independent review

Pending.
