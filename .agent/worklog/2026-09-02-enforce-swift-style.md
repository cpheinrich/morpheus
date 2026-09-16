---
agent: codex
date: 2026-09-02
roadmap: MO-26-09-02-18.49.01
outcome: success
---

# Native Swift formatting and lint enforcement

Added an opt-in `swift-format` gate to the reusable iOS workflow. It uses the formatter bundled
with the caller-selected Xcode toolchain, validates the caller's checked-in configuration, and
lints only added, copied, modified, and renamed Swift files in the current commit.

The incremental boundary is deliberate: enabling the gate does not create a repository-wide
mechanical rewrite, while every Swift file touched from that point forward must pass strict lint.
SwiftLint and third-party SwiftFormat were considered and deferred because the built-in tool
covers the requested formatter and lint contract with no additional dependency.

Validation passed 38 test files with 1,082 tests, including an executable Git fixture proving the
changed-file boundary, plus TypeScript typechecking, compilation, PM validation, and diff checks.
