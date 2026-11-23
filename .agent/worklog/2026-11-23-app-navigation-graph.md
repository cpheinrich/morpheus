---
roadmap: MO-26-11-23-13.52.55
tags: [engineering, product]
---

# Share application navigation graphs and capture refresh

The product-research viewer and capture refresh skill share the existing study contract. Projects own their app-specific captures, metrics and publishing. The managed skill describes synthetic route playback, stable identifiers, study validation, and independent proof of the public App Store build.

The browser tests exercised node selection by keyboard and pointer, URL history, pan, zoom, fit,
and the minimap. The viewer rendered real version 1 study fixtures at the consumer boundary.
The desktop overview fits the full graph, and the narrow viewport starts with the entry visible
at a readable zoom. The screen list remains available while the graph loads.

The first proposed React Flow version was too recent for the existing dependency release age
policy. The locked 13.0.2 release passes the policy and the same visual and interaction tests.

## Independent review

Independent review cleared the shared graph and capture skill. A fresh follow-up verified the final viewport and graph fallback, and inspected both replacement browser captures.

The first review used Claude Opus 5.5 Standard on the MacBook Pro. The exact-candidate follow-up used a fresh GPT-6.2 Sol Standard session on that host.

```morpheus-review
{
  "version": 2,
  "base": "3ef9ceaa40d5e4b3e86e5363aca3b29e21003d08",
  "reviewed": "b8f09816fbdc0c27b14231b082e6479896efafc0",
  "covered": "fd6eafa66660e8beda10ddaee9ea724e42483d26",
  "authorSession": "01a1fb32-d90d-75c1-8dcb-f4559c0eff60",
  "reviewerSession": "f48f7e7b-b2e7-4e2e-999c-5f2eb4d1a75d",
  "risk": "normal",
  "elapsedMinutes": 4.080266666666667,
  "timing": {
    "source": "runner",
    "durationMs": 244816,
    "evidence": "Guardian process.json for admission e0b55ad9-28ea-48ae-b505-a5ae6fe12da5; monotonic duration includes owned cleanup."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the shared graph and capture skill. A fresh follow-up verified the final viewport and graph fallback, and inspected both replacement browser captures.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-23-13.52.55-add-app-navigation-graph.md",
    ".agent/worklog/2026-11-23-app-navigation-graph.md",
    ".agent/decisions.md",
    "docs/runbooks/product-research.md",
    "architecture.md",
    "src/product-research/README.md"
  ],
  "findings": [
    {
      "id": "R1-F1",
      "severity": "minor",
      "description": "The iOS capture skill inherited the motion design template's declaration comment.",
      "paths": [
        "src/init/templates.ts",
        "dist/init/templates.d.ts"
      ],
      "disposition": "fixed",
      "response": "Restored the motion design comment and added the iOS capture description."
    },
    {
      "id": "R1-F2",
      "severity": "minor",
      "description": "A rejected lazy graph render could unmount the screen list and detail.",
      "paths": [
        "src/product-research/react.tsx",
        "tests/product-research-react.test.tsx"
      ],
      "disposition": "fixed",
      "response": "Isolated graph errors and verified that screen selection still works."
    },
    {
      "id": "R1-F3",
      "severity": "minor",
      "description": "The initial mobile screenshot showed only the graph panel.",
      "paths": [
        "src/product-research/styles.css"
      ],
      "disposition": "fixed",
      "response": "Replaced it with a 390 px viewport containing the graph and screen list."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a20aa8-594f-7ee1-ad6d-0f6e5ebde9c9",
      "commit": "fd6eafa66660e8beda10ddaee9ea724e42483d26",
      "scopeReason": "A repeat browser run exposed an intermittent initial mobile viewport after the first clearance. Verify its correction and the prior minor changes.",
      "handoff": {
        "reason": "Fleet requires a fresh session bound to the exact updated published revision.",
        "findings": [
          "R1-F1",
          "R1-F2",
          "R1-F3"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 5.27005,
      "timing": {
        "source": "runner",
        "durationMs": 316203,
        "evidence": "Guardian process.json for admission f89277a9-7698-4354-9cf9-ce6acbca6a2f; monotonic duration includes owned cleanup."
      },
      "summary": "Cleared the final viewport initialization, error fallback, and skill metadata. Verified and inspected both final screenshots."
    }
  ]
}
```
