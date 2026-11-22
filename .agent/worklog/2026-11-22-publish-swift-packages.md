---
date: 2026-11-22
agent: codex
roadmap: MO-26-11-22-01.29.25
tags: [engineering, devops]
outcome: review
---

# Shared Swift packages and Screen QA

The root SwiftPM manifest defines opt-in library products. Screen QA is shipped
with the current launcher, batch notes, handoff receipts and larger comment
editor, with app-specific examples replaced by synthetic ones. The original
draft and diagnostic field names remain part of the compatibility contract.
Service setup stays with the app.

Native validation reuses the Morpheus Xcode workflow and simulator actions. The
existing tests exercise UIKit targets and mock upload and review without an app
or service account. Using the package's Xcode scheme keeps the CI lane on the
native toolchain without another build system or fixture app.

Managed projects discover and sync the Swift package routing instructions
through the existing skill registry. The instructions send shared edits to the
upstream repository and use app configuration for supported customization.

## Validation

- Focused project-skill, instruction, workflow expression, workflow contract,
  and iOS retry tests passed (316 tests). Typecheck, compile, roadmap index,
  and lint of the changed workflows passed.
- Complexity enforced the existing limits. The imported hierarchy and
  diagnostic serialization functions have two cognitive-complexity advisories.

- Native package build and test on the iPhone 17 Pro iOS 26.5 simulator using
  the Xcode 27.2 package scheme. All 36 tests passed. A separate SwiftUI
  consumer also typechecked against the public library interface on iOS 18
  using a mock send callback.
- While Morpheus is public, GitHub requires approval for all outside
  contributors' fork workflows. The package CI caller is scoped to trusted
  repository branches. The self-hosted runner's registration credential is
  resolved on the Mac, and the temporary VM receives only its one-job runner
  registration.

## Delivery

The initial tag will identify the protected merge. Consumer adoption will
continue in a separate draft pull request.
