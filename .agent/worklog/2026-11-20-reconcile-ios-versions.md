---
date: 2026-11-20
agent: codex
roadmap: MO-26-11-20-13.19.42
outcome: review
tags: [engineering, devops]
---

# Check the live App Store version before iOS delivery

The common iOS release gate now compares the pinned Xcode project with Apple’s public storefront before release work. The checker proposes the next patch when the versions match. A guarded write resets the Xcode build settings to zero and callers use their normal protected PR process before restarting delivery.

## Verification

The controller verified the Fleet patch against the published claim and ran 287 focused tests, typecheck, compile, project index, actionlint and the changed-function complexity check. The live listing matched Xcode 1.0. A throwaway project was rewritten to 1.0.1 and build 0, validated with plutil and compared byte for byte with the downstream candidate. The live check accepted the new candidate as ahead. No package was added.

Fleet implementation ran with Codex on the MacBook Pro. The focused tests use simulated lookup failures. The controller separately read the actual public store and validated the real Xcode file.
