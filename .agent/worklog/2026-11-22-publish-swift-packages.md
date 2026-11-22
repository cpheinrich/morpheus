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
- The first GitHub run passed all 36 tests on the Mac mini and its one-job
  VM was deleted. Independent review found that a fork can modify its workflow,
  so the first version's in-workflow restriction could not enforce runner admission.
- While Morpheus is public, the Mac dispatcher enrolls the private validation
  repository for this lane and has removed public Morpheus from its queue.
  Fork workflows are disabled in the private caller. A maintainer pins the
  reusable workflow and exact public source SHA in a branch in that repository.
  The Mac still resolves its existing credential locally. The 229 focused
  workflow tests and lint of both changed workflows passed after the correction.
  The direct workflow stays ready for Morpheus once it is private and enrolled.

## Delivery

The initial tag will identify the protected merge. Consumer adoption will
continue in a separate draft pull request.
