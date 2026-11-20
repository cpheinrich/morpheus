---
date: 2026-11-20
roadmap: MO-26-11-20-13.23.42
tags: [engineering, qa]
---

# Add batch notes to QA feedback tools

The simulator and web overlays now keep optional Notes in the tab draft and send
it at batch level. The production web panel freezes the notes with the batch ID
so a retry resends the same content. Local batches expose notes to both the
interactive QA skill and its independent serial responder. Existing batches are
compatible with the optional field.

This supplies the shared UI and schema. Each live site owns its persistence
adapter and dependency revision. Native iOS QA and the automatic dispatcher
are maintained in Evo.

Validation covered the 2,000-character boundary, browser reload, ambiguous retry,
and successful send. Typechecking, compilation, 151 focused unit tests and 50
browser tests passed. Eight affected browser cases passed after the final
visual adjustment.

## Independent review

The Fleet reviewer ended without a verdict. The fresh gateway reviewer inspected the four final captures and cleared the change with a condition to verify that Notes return to the draft after a definite rejection. The added test passed and failed as expected when restoration was temporarily removed. The notes schema now specifies persistence in live-site adapters.

```morpheus-review
{
  "version": 2,
  "base": "2c5f4147cff2edd468ebdd24c73189af63ecd259",
  "reviewed": "024d63a5db19c14fa1496e998eab3480d8a28de6",
  "covered": "562f2948c96206f7c5b9863ff68aa83c4f6a954b",
  "authorSession": "01a1fad6-4689-74f2-bfb3-a1a5eec63168",
  "reviewerSession": "01a1faec-fa33-7232-87ac-8ef37b7b3f80",
  "risk": "normal",
  "elapsedMinutes": 8.476633333333334,
  "timing": {
    "source": "runner",
    "durationMs": 508598,
    "evidence": "Fleet receipt for run 2d2a0d39-6f11-4510-803d-d6e30a955217 on MacBook Pro, Codex GPT-6.2 Sol, with verified termination and no verdict."
  },
  "outcome": "complete",
  "initialOutcome": "incomplete",
  "summary": "The Fleet reviewer ended without a verdict. The fresh gateway reviewer inspected the four final captures and cleared the change with a condition to verify that Notes return to the draft after a definite rejection. The added test passed and failed as expected when restoration was temporarily removed. The notes schema now specifies persistence in live-site adapters.",
  "contextRead": [
    "CLAUDE.md",
    "hq/product/roadmap/MO-26-11-20-13.23.42-add-qa-batch-notes.md",
    "docs/runbooks/qa-comments.md",
    "qa/acceptance/production-web-qa.md",
    ".agent/worklog/2026-11-15-ship-web-qa-comments.md",
    ".agent/worklog/2026-11-20-add-qa-batch-notes.md"
  ],
  "followUps": [
    {
      "reviewerSession": "4d7c2f31-a08f-4b65-9b91-198419aff2b7",
      "commit": "024d63a5db19c14fa1496e998eab3480d8a28de6",
      "elapsedMinutes": 2.5758666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 154552,
        "evidence": "Factory gateway run 927c8377-91f8-40c8-a385-e5becc560334 on MacBook Pro, Claude Opus 5.5 Standard. Provider result event measured duration_ms=154552; process group exit was verified."
      },
      "outcome": "cleared",
      "summary": "Opened four captures and passed 206 focused tests. Conditionally cleared after a targeted rejection restoration regression check.",
      "handoff": {
        "reason": "The previous Fleet session ended without a verdict and returned no artifact.",
        "findings": []
      }
    }
  ],
  "findings": [
    {
      "id": "QA-NOTES-F1",
      "turn": 2,
      "severity": "substantive",
      "paths": [
        "tests/qa-web-drafts.test.ts"
      ],
      "description": "A missing regression assertion let a rejected batch lose its note when reopened for correction.",
      "disposition": "fixed",
      "response": "Freeze a batch with padded notes, reopen it after rejection and assert the exact trimmed draft note.",
      "condition": {
        "paths": [
          "tests/qa-web-drafts.test.ts",
          "docs/runbooks/qa-comments.md",
          ".agent/worklog/2026-11-20-add-qa-batch-notes.md"
        ],
        "evidence": "The drafts suite passes. Temporarily delete the notes restoration statement and verify the new assertion fails, then restore it."
      },
      "conditionMet": "The drafts suite passed 27 tests, and the targeted test failed with expected undefined to be Shared guidance when restoration was removed. The original source was restored and the drafts suite passed again."
    },
    {
      "id": "QA-NOTES-F2",
      "turn": 2,
      "severity": "minor",
      "paths": [
        "docs/runbooks/qa-comments.md"
      ],
      "description": "The batch schema table omitted the Notes field.",
      "disposition": "fixed",
      "response": "Added a schema row naming the optional trimmed 2,000-character field."
    },
    {
      "id": "QA-NOTES-F3",
      "turn": 2,
      "severity": "minor",
      "paths": [
        "docs/runbooks/qa-comments.md"
      ],
      "description": "Live web adapters may store an explicit field list and need to include Notes.",
      "disposition": "fixed",
      "response": "The schema row makes the live adapter persistence requirement explicit."
    },
    {
      "id": "QA-NOTES-F4",
      "turn": 2,
      "severity": "minor",
      "paths": [
        "src/qa/web/overlay-client.ts"
      ],
      "description": "Command+Enter inside the local web Notes field does not submit the batch.",
      "disposition": "disputed",
      "response": "The local shortcut is shown in the pin composer. The Notes textarea keeps its ordinary multiline behavior, with the explicit Send batch button available."
    },
    {
      "id": "QA-NOTES-F5",
      "turn": 2,
      "severity": "minor",
      "paths": [
        "src/qa/web/mount.ts"
      ],
      "description": "The comments list has limited visible height in the shortest captures.",
      "disposition": "disputed",
      "response": "The panel scrolls at constrained heights and keeps the send action reachable. The short-viewport browser checks passed."
    }
  ]
}
```
