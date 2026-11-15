---
roadmap: MO-26-11-15-02.43.34
tags: [engineering, devops, factory]
---

# Accept versioned Codex models in Factory Fleet

A synthetic startup probe reproduced a model-validation failure with a dotted
Codex identifier. Service enrollment and both explicit submit interfaces now
use the same bounded model grammar. Each request still uses the exact
enrolled model as its authority. Routing IDs keep their existing grammar.

The real service booted locally with synthetic enrollment and returned its
JSON 401 for an unauthenticated request. The focused Factory suites passed 14
tests, including default and explicit dotted selection, a version mismatch,
a malformed model name, and a dotted project ID. Typecheck, compile and
the scoped Lizard complexity check passed.

## Independent review

Cleared with one minor compatibility-related simplification note and no substantive findings.

A fresh Opus 5.5 high-effort reviewer on the MacBook Pro cleared this PR.
The reviewer verified enrollment and exact matching, both submit interfaces,
and the executor boundary. They independently ran the 12 workspace tests.
The model grammar preserves every name accepted by the prior service and
adds internal dots. Aligning legacy rejection rules with the stricter worker
configuration would be a separate behavior change.

```morpheus-review
{
  "version": 2,
  "base": "ff65a6ffa648d79c08ff6f7cd15bd424586b3ebd",
  "reviewed": "ace58cb7692f2b76f76bae12ffb5727fd6bf6434",
  "covered": "ace58cb7692f2b76f76bae12ffb5727fd6bf6434",
  "authorSession": "01a1dc31-6582-7f10-bd74-50b610e7ba6c",
  "reviewerSession": "9047b0a7-3d65-4563-9143-e03581718593",
  "risk": "normal",
  "elapsedMinutes": 1.5166666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 91000,
    "evidence": "Controller UTC readings around Factory run a0630d19-d0de-4176-a1fa-956a50c313a5: start at 2026-11-15T10:47:04Z, observed terminal result by 2026-11-15T10:48:35Z."
  },
  "outcome": "complete",
  "summary": "Cleared with one minor compatibility-related simplification note and no substantive findings.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-15-02.43.34-accept-versioned-fleet-models.md",
    ".agent/worklog/2026-11-15-accept-versioned-fleet-models.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "R-1",
      "severity": "minor",
      "description": "The new Fleet model grammar preserves already-accepted names that the stricter worker config may reject.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "disputed",
      "response": "Keep the prior Fleet acceptance set and add only internal dots. Changing acceptance of existing enrollment strings is unrelated to the observed failure and could strand an existing service configuration at startup."
    }
  ]
}
```
