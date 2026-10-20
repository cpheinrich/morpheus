---
roadmap: MO-26-10-19-19.10.42
---

# Add reviewed macOS host integration for CD V2

## Discovery

The CD V2 design, controller, workflow adapters and exact immutable control-tag upload guard are already merged in Morpheus PRs #415–#418. Evo PR #553 already carries the observation-mode consumer integration and its private campaign record. No open Morpheus PR covers local host supervision.

The recovery session had a separate local prototype under `MorpheusCD/public-host-preparation`. It fixed the actual published CLI path, explicit `cd tick|worker` grammar, `--source-dir`, child-only credential loading, recurring worker wakeup and several template guards. Its synthetic generated-wrapper suite reports 41 passes. The earlier local rendered host files had not been loaded; the corrected generic templates also had not been installed.

This work brings only the project-agnostic macOS wiring and its synthetic validation into the Morpheus repository. It does not carry Evo's paths, credentials, private RCA, ledger state or protected-environment settings.

## Implementation

Added source templates for a shared guarded shell, separate tick and local-worker entrypoints, and two five-minute launchd jobs. Added a generated-wrapper integration test using spaced temporary paths and synthetic credentials, a Vitest entrypoint, and a runbook that covers observe-first setup, actual host prerequisites, and exact-label rollback. Linked the host assets from the CD package README and controller guide.

The templates intentionally remain reviewed source assets copied from an exact Morpheus commit. No CLI installer, state initialization, launchctl invocation, consumer credential mapping, automatic activation, legacy drain, or TestFlight assertion is provided. A future need for two independently managed consumers may justify a renderer command; this change keeps the first consumer path small and explicit.

## Verification

Pending focused host integration test, typecheck, compile, docs links and PR CI. The source test harness is based on the previously executed 41-check synthetic suite; the result will be rerun from the Morpheus task branch.
