---
date: 2026-11-22
agent: codex
roadmap: MO-26-11-22-22.22.12
tags: [engineering, devops, ios]
outcome: review
---

# Screen QA toolbar contrast

Review and Exit use system labels on opaque system backgrounds in both appearances.
The Swift package reports the actual executed test count in CI from the combined Xcode
result. The separate XCTest-only console line reported zero in the previous proof while
Swift Testing ran 36. The prior artifact confirmed 36 passed on its recorded source.

Claude Standard implemented the patch through Factory run 1096bdf0-ba1d-43cb-a3c2-dc5dea3135d5
on MacBook Pro. It completed with verified cleanup. Patch SHA-256
15047cab6d148f65a0846a760884ba8549a9c6ea357d2f1f2c015e6148301996 matched before application.

The controller independently ran the Swift package on a disposable iPhone 17 Pro simulator
using Xcode 27.2 and iOS 26.5. The Xcode result records 38 tests passed, zero failed or skipped.
Both synthetic toolbar attachments were opened and inspected. Review and Exit display black
text on white in light mode and white text on black in dark mode. The test also verifies
the semantic color contrast. The workflow fixture verifies a real count and rejects an
all-skipped result. The 242 focused workflow tests, typecheck, compile, project index,
complexity, actionlint and whitespace checks passed.

Independent review found that the original rendered test checked the Review capsule background without exercising both labels against it. The corrected test checks the rendered Review and Exit text against their own capsule colors using a deliberately light app accent. All 38 package tests passed again, and the two standard appearance captures are byte-identical.

The first independent review ran on MacBook Pro through Factory run 64ddcdcc-78ee-4e0a-a716-b692e1ba6811. The cleared follow-up ran on MacBook Pro through Factory run 4af30b80-bb44-4d2d-8fad-cc8b16007172. Both ran Codex Standard and receipts verify cleanup.

The initial review found one substantive gap. The rendered regression test checked only the Review fill and could miss unreadable Exit or Review text. The revised simulator test measures each label against its own background in both appearances, and each isolated styling regression fails its intended assertion. A fresh reviewer reran the focused native tests, matched and inspected both captures, and cleared the correction. The full local package suite passed all 38 tests.

```morpheus-review
{
  "version": 2,
  "risk": "normal",
  "base": "1584f6f47adbc1246fa813fe0cae7080cbc9cae9",
  "reviewed": "36b15effcd1c0c2101f1126465f32aff59bef159",
  "covered": "a882b5575ff2e7ad0ca140199a95ffc9b55b1759",
  "authorSession": "01a1fb82-04ac-7af0-aa4f-7d383254c3ab",
  "reviewerSession": "01a2071e-9268-7bf2-82ad-8fb38c1a1ba0",
  "outcome": "complete",
  "elapsedMinutes": 3.3838666666666666,
  "timing": {
    "source": "runner",
    "durationMs": 203032,
    "evidence": "Factory Guardian process.json for admission efe0a34a-6bbe-4403-92a2-ab38a2e05424, exact run 64ddcdcc-78ee-4e0a-a716-b692e1ba6811."
  },
  "summary": "The initial review found one substantive gap. The rendered regression test checked only the Review fill and could miss unreadable Exit or Review text. The revised simulator test measures each label against its own background in both appearances, and each isolated styling regression fails its intended assertion. A fresh reviewer reran the focused native tests, matched and inspected both captures, and cleared the correction. The full local package suite passed all 38 tests.",
  "contextRead": [
    "AGENTS.md",
    "hq/product/roadmap/MO-26-11-22-22.22.12-improve-screen-qa-contrast.md",
    "docs/swift-packages.md",
    ".agent/worklog/2026-11-22-publish-swift-packages.md",
    ".agent/worklog/2026-11-22-improve-screen-qa-contrast.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    ".agent/decisions.md",
    "hq/product/roadmap/MO-26-11-22-01.29.25-publish-swift-packages.md",
    "qa/acceptance/publish-swift-packages.md",
    ".agent/worklog/2026-09-04-self-host-ios-ci.md",
    ".agent/worklog/2026-09-26-ios-test-evidence.md",
    ".agent/worklog/2026-10-20-support-runner-labels.md",
    "docs/runbooks/ios-simulator-cleanup.md"
  ],
  "findings": [
    {
      "id": "MO762-01",
      "severity": "substantive",
      "description": "The rendered assertion samples only one Review capsule fill pixel. The semantic test at line 33 resolves constants without checking where the toolbar applies them. Reverting only the Exit modifiers at ScreenCommentView.swift:113 to the old translucent white fill and inherited theme foreground would leave every asserted value unchanged, while Exit could again render light text on a light capsule in a host with a light dark-mode accent. The same test also misses loss of Review's explicit foreground. The present images are good, but the native test can stay green after the user-facing regression comes back.",
      "paths": [
        "packages/swift/ScreenQA/Tests/MorpheusScreenQATests/ScreenCommentToolbarAppearanceTests.swift"
      ],
      "disposition": "fixed",
      "response": "Lines 75-89 render both appearances with a synthetic 80%-white primary and require at least 4.5:1 between each button's label region and its own capsule fill. The controller's isolated Exit revert and Review foreground removal each failed the intended contrast assertion."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a20727-cee3-71a1-8438-bfd8bcb88d0d",
      "commit": "a882b5575ff2e7ad0ca140199a95ffc9b55b1759",
      "outcome": "cleared",
      "elapsedMinutes": 2.6834,
      "timing": {
        "source": "runner",
        "durationMs": 161004,
        "evidence": "Guardian process.json for admission 59558d39-a532-4b8d-af87-9471aa60c0ff; monotonic duration includes owned cleanup. Cleanup was proven later by a fresh owned-process census (reconciliation.json)."
      },
      "summary": "MO762-01 is fixed. The rendered test checks Review and Exit separately against their own capsule fills in light and dark with a synthetic light host accent. No new findings in the follow-up scope.",
      "handoff": {
        "reason": "The unattended controller delegated a fresh independent follow-up on the correction to the sole earlier finding.",
        "findings": [
          "MO762-01"
        ]
      }
    }
  ]
}
```
