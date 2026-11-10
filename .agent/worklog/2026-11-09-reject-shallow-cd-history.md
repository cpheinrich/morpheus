---
date: 2026-11-09
roadmap: MO-26-11-09-15.10.54
tags: [engineering, devops]
---

# Reject shallow CD source history

Issue #445 showed that a depth-limited source clone can renumber first-parent commits below sources already admitted to a delivery ledger. Both the controller and repair worker use the same source loader. The loader now checks the checkout after its normal fetch and before enumerating ordinals or reading PR evidence. The operator can unshallow the source clone and retry the same operation.

A real local depth-one Git clone reproduces the boundary. The regression checks that it stops before PR lookup and that unshallowing restores the exact full-clone source record, including ordinal 1. The adapter, controller and native-worker suites passed all 360 cases.

The independent reviewer cleared the exact implementation with no findings. They reran the real shallow-clone regression and verified that recovery restored the same source record and ordinal as the full checkout.

```morpheus-review
{
  "version": 2,
  "base": "9b43d1ee4ed779b28df013c4f7f20f27cca531f8",
  "reviewed": "7cbd6a66b2defe7c90cca8277db2e5944a4e0f50",
  "covered": "7cbd6a66b2defe7c90cca8277db2e5944a4e0f50",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_shallow_cd",
  "risk": "normal",
  "elapsedMinutes": 1.1166666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 67000,
    "evidence": "Controller UTC clock readings around the single collaboration reviewer invocation: 2026-11-09 23:14:18 to 23:15:25 UTC, with the terminal review received before the end reading."
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the exact implementation with no findings. They reran the real shallow-clone regression and verified that recovery restored the same source record and ordinal as the full checkout.",
  "findings": []
}
```
