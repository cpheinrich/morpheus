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

## Independent review

Independent review found that a public fork could change a workflow-only runner restriction. The correction scopes runner registration to the private caller while Morpheus is public. A fresh review cleared that boundary. The final focused review cleared an unset-input compatibility fix surfaced by the full Node suite.

The private Mac run tested the exact first corrected source commit and passed
all 36 tests. The late correction passed 237 workflow and evidence tests
locally. The original fork approval setting was restored once the public
repository had no self-hosted runner enrollment.

```morpheus-review
{
  "version": 2,
  "base": "d978b2abd80b2a92493fde6b4b717289b86c04a5",
  "reviewed": "350cc8f4aa97103a2d6628cca4378d89f6bc5e7a",
  "covered": "b5c95f20697ec924eef271a526e42b662e576d46",
  "authorSession": "01a1fb82-04ac-7af0-aa4f-7d383254c3ab",
  "reviewerSession": "01a202b1-0b29-7162-8df3-2c07f99ef1ca",
  "risk": "high",
  "elapsedMinutes": 5.916266666666667,
  "timing": {
    "source": "runner",
    "durationMs": 354976,
    "evidence": "Factory run 9052e01f-349e-40bc-b066-518829cd3413, guardian admission d5707a02-6622-43f0-a976-8c8cbf3cf070, measured runner time includes verified owned cleanup."
  },
  "outcome": "complete",
  "summary": "Independent review found that a public fork could change a workflow-only runner restriction. The correction scopes runner registration to the private caller while Morpheus is public. A fresh review cleared that boundary. The final focused review cleared an unset-input compatibility fix surfaced by the full Node suite.",
  "contextRead": [
    "AGENTS.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/pm-workflow.md",
    "hq/product/roadmap/MO-26-11-22-01.29.25-publish-swift-packages.md",
    "qa/acceptance/publish-swift-packages.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-22-publish-swift-packages.md",
    ".agent/worklog/2026-09-04-self-host-ios-ci.md",
    ".agent/worklog/2026-10-20-support-runner-labels.md",
    "docs/runbooks/ios-simulator-cleanup.md",
    "docs/swift-packages.md",
    "hq/product/roadmap/MO-26-10-27-13.11.05-index-project-skills.md"
  ],
  "findings": [
    {
      "id": "MO761-01",
      "severity": "substantive",
      "description": "A public fork can change the workflow expression that was the only per-job provenance restriction on eligible Mac runners.",
      "paths": [
        ".github/workflows/swift-packages.yml",
        ".github/workflows/ios-ci.yml"
      ],
      "disposition": "fixed",
      "response": "Removed the public repository from Mac enrollment and verified zero runner registrations. Enrolled the private caller with fork workflows disabled. It calls the same reusable workflow for an exact Morpheus commit, and the controller verifies the runner and artifact before posting a status. Direct CI is limited to private visibility."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a202bb-f4eb-7683-859e-355d37600f74",
      "commit": "62dc538720418f93b9dea3f519a58bac2bc3d2c4",
      "outcome": "cleared",
      "elapsedMinutes": 2.8636833333333334,
      "timing": {
        "source": "runner",
        "durationMs": 171821,
        "evidence": "Factory 269b3fe3-86f5-449d-8af9-875544c5e965, guardian admission c73186a4-91e3-4669-b15f-cee72abe9f32 measured owned invocation and cleanup."
      },
      "summary": "Cleared MO761-01. Runner enrollment is controlled independently of public workflow YAML. Verified the workflow and checkout contracts and required controller verification of the exact-Mac run before merging.",
      "handoff": {
        "reason": "The initial one-shot Fleet session stopped after returning its full finding. Fresh reviewer received that finding, the corrected candidate and the enrollment evidence.",
        "findings": [
          "MO761-01"
        ]
      }
    },
    {
      "reviewerSession": "01a202bf-b346-7f80-ae67-8f3f0e1de66f",
      "commit": "b5c95f20697ec924eef271a526e42b662e576d46",
      "outcome": "cleared",
      "elapsedMinutes": 2.3927,
      "timing": {
        "source": "runner",
        "durationMs": 143562,
        "evidence": "Factory 74d8dc28-c84a-4650-856e-3c0029a98c38, guardian admission 2e1948e7-b780-4a36-81b5-0e47ecf30875 measured owned invocation and cleanup."
      },
      "summary": "Cleared the one-line default for the optional source repository and verified exact-SHA validation remains intact. No new findings.",
      "handoff": {
        "reason": "The prior one-shot Fleet review had already ended after clearing the runner boundary. New reviewer received the prior verdict, the late failing test and the one-line corrective diff.",
        "findings": [
          "MO761-01"
        ]
      },
      "scopeReason": "Full Node CI exposed absent optional SOURCE_REPOSITORY in a legacy CD validator fixture after the previous clearance. Scope is limited to the one-line default and the directly related evidence and caller checks."
    }
  ]
}
```
