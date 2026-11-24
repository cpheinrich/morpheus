---
roadmap: MO-26-11-23-22.43.28
tags: [engineering, product-research]
---

# Study navigation flows

The study schema now supports a validated optional flow hierarchy. The viewer starts with one entry, reveals only the current step's immediate transitions, and opens child entries as their own flow. Direct subflow selection covers conditional and resumed entries. Back and Escape restore the previous graph and screen. The graph distinguishes observed arrows from release-source documentation. Plain wheel scroll remains available to the page. Cmd or Ctrl plus scroll zooms the diagram.

React Flow and Dagre supply the existing canvas, layout and controls. The graph calculates its viewport from the actual canvas dimensions after the browser check identified clipping on narrow screens. Legacy studies retain the all-screen graph. Selection, hash navigation, and the accessible screen list were verified in Chromium. Public visual evidence uses a synthetic app fixture.

Private Fleet implementation patches were independently verified against the exact base before integration. The initial Claude session lost supervision and completed owned cleanup without artifacts. The subsequent Codex UI and schema runs had separate file ownership and both returned validated patches. The controller handled integration and visual QA.

```mermaid
flowchart LR
  A[Choose a flow] --> B[Entry screen]
  B --> C[Immediate navigation choices]
  C --> D[Child entry]
  C --> E[Screen details]
  D --> C
  C -->|Back or Escape| B
```

The first independent review found the scoped graph highlight ignored screen-list and history changes. The highlight now follows the selected screen while Back retains its traversal history. Follow-up improvements add actual fit padding, explicit keyboard activation for subflows and a single zoom hint that hides on touch-only devices. The focused suite covers both list/history synchronization and keyboard subflow selection, for 65 passing tests.

## Independent review

Independent review cleared the shared viewer and verified the repaired screen selection, keyboard subflow controls, mobile fit and three synthetic screenshots.

```morpheus-review
{
  "version": 2,
  "base": "7bde7b3b079fc8a7f94fc57235f00305f223c75d",
  "reviewed": "0f39ab285886506e2f3a63e49beb5cdfffcaf893",
  "covered": "0f39ab285886506e2f3a63e49beb5cdfffcaf893",
  "authorSession": "01a1fb32-d90d-75c1-8dcb-f4559c0eff60",
  "reviewerSession": "eb081c72-81f5-40b3-a98b-cda1cd693919",
  "risk": "normal",
  "elapsedMinutes": 1.4853833333333333,
  "timing": {
    "source": "runner",
    "durationMs": 89123,
    "evidence": "Guardian process.json for admission 8719164b-cc03-4d08-8b62-e5fea32c7fd0; monotonic duration includes owned cleanup."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the shared viewer and verified the repaired screen selection, keyboard subflow controls, mobile fit and three synthetic screenshots.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-23-22.43.28-organize-research-navigation.md",
    ".agent/worklog/2026-11-23-study-navigation-flows.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-23-app-navigation-graph.md",
    "docs/runbooks/product-research.md",
    "hq/product/roadmap/MO-26-11-23-13.52.55-add-app-navigation-graph.md"
  ],
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "paths": [
        "src/product-research/navigation-graph.tsx"
      ],
      "description": "When sibling subflows share an entry screen, the node opens one and the other remains available in the subflow picker.",
      "disposition": "disputed",
      "response": "Shared entries represent valid conditional journeys. Every child is directly selectable by its name, so rejecting shared entries would remove supported journeys."
    }
  ]
}
```
