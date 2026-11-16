---
date: 2026-11-15
roadmap: MO-26-11-15-18.52.12
tags: [engineering]
---

# Share the production web QA panel

Export an inline comment panel and bounded schema to managed websites. The panel
starts in Pin mode, keeps per-account tab drafts, and exposes optional Factory
controls to the site's authorized owner. The site's server verifies access and
owns the database write. A lost reply stays bound to the original batch ID.

A Claude 5.5 job through the configured gateway wrote the initial patch in
the claimed worktree. The session stopped before its completion report. I took
over the patch and added launch-control pass-through, viewport scroll context,
explicit rejection handling, default-off reset and closed-panel draft protection.

The seven focused Vitest files passed 171 tests. Typecheck, compilation, indexing,
complexity and whitespace checks passed. A linked Darwin build in Chromium
exercised the shared module at 1440px and 390px against Firebase emulators with
synthetic identities. Local overlay regressions use the focused Chromium and
WebKit suite.

## Independent review

The independent review found retry duplication, storage failure, private shadow targets, noncanonical paths, unreachable short-screen controls, and unsafe Escape deletion. The author fixed all six. The reviewer cleared the final commit after isolated unit and browser checks and inspection of the short owner capture.

```morpheus-review
{
  "version": 2,
  "base": "db0231bd35b377fb42b664af0fb04a6cca3190eb",
  "reviewed": "447d0d2fcaf84f7fee92dbf46b18282f1a1073ee",
  "covered": "3200efa460f4002cfd92895e7c385e94f06a13ff",
  "authorSession": "01a1e238-7cdd-78f1-bbce-9647aacb355e",
  "reviewerSession": "/root/review_morpheus_web_qa",
  "risk": "high",
  "elapsedMinutes": 4.95475,
  "timing": {
    "source": "clock",
    "durationMs": 297285,
    "evidence": "Runner transcript invocation 03:15:31.807 UTC and final verdict 03:20:29.092 UTC."
  },
  "outcome": "complete",
  "summary": "The independent review found retry duplication, storage failure, private shadow targets, noncanonical paths, unreachable short-screen controls, and unsafe Escape deletion. The author fixed all six. The reviewer cleared the final commit after isolated unit and browser checks and inspection of the short owner capture.",
  "contextRead": [
    "AGENTS.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-15-18.52.12-ship-web-qa-comments.md",
    "qa/acceptance/production-web-qa.md",
    "docs/runbooks/qa-comments.md",
    ".agent/worklog/2026-11-15-ship-web-qa-comments.md",
    ".agent/worklog/2026-11-08-capture-web-qa-diagnostics.md",
    ".agent/decisions.md"
  ],
  "findings": [
    {
      "id": "QA-WEB-01",
      "severity": "substantive",
      "paths": [
        "src/qa/web/mount.ts",
        "src/qa/web/drafts.ts"
      ],
      "description": "A rejected batch retry could leave an editable stored copy and submit a second UUID after reopening.",
      "disposition": "fixed",
      "response": "Persist an unconfirmed pending batch before every attempt. Retain the UUID and only permit editing after a definite rejection with no previous uncertain attempt."
    },
    {
      "id": "QA-WEB-02",
      "severity": "substantive",
      "paths": [
        "src/qa/web/mount.ts"
      ],
      "description": "A failed storage write could leave an older editable draft after a network write.",
      "disposition": "fixed",
      "response": "Hold the transport when a stale local draft cannot be replaced, retain the composer, and explain retry. Tested with a storage quota exception."
    },
    {
      "id": "QA-WEB-03",
      "severity": "substantive",
      "paths": [
        "src/qa/web/mount.ts",
        "src/qa/web/drafts.ts"
      ],
      "description": "Retargeting allowed pointer or keyboard pins through private shadow hosts and private slots.",
      "disposition": "fixed",
      "response": "Check full composed paths and DOM/shadow ancestry, and cancel Enter on private targets. Tested both inputs and slotted wrappers."
    },
    {
      "id": "QA-WEB-04",
      "severity": "substantive",
      "paths": [
        "src/qa/web/schema.ts"
      ],
      "description": "Encoded dot segments admitted a path the browser would resolve to a different route.",
      "disposition": "fixed",
      "response": "Reject dot segments after decoding, including mixed encoded and literal forms."
    },
    {
      "id": "QA-WEB-05",
      "severity": "substantive",
      "paths": [
        "src/qa/web/mount.ts",
        "tests/browser/qa-web-production.spec.ts"
      ],
      "description": "The owner could not reach Send with both toggles on short viewports.",
      "disposition": "fixed",
      "response": "Make every panel scrollable. Playwright verified both toggles and Send at 375\u00d7667 and 1280\u00d7400, in Chromium and WebKit."
    },
    {
      "id": "QA-WEB-06",
      "severity": "substantive",
      "paths": [
        "src/qa/web/mount.ts"
      ],
      "description": "Escape auto-repeat and selection changes could delete a different draft.",
      "disposition": "fixed",
      "response": "Ignore repeats and tie arming to a single draft ID. Tested repeat and switching drafts."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_morpheus_web_qa",
      "commit": "5228be2e1556bc6314768b97a775542559993398",
      "outcome": "blocked",
      "elapsedMinutes": 1.6452666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 98716,
        "evidence": "Runner transcript invocation 03:25:07.274 UTC and final verdict 03:26:45.990 UTC."
      },
      "summary": "Cleared QA-WEB-01, QA-WEB-02, QA-WEB-04 and QA-WEB-06. Open shadow slots and short desktop viewports still failed."
    },
    {
      "reviewerSession": "/root/review_morpheus_web_qa",
      "commit": "3200efa460f4002cfd92895e7c385e94f06a13ff",
      "outcome": "cleared",
      "elapsedMinutes": 0.46363333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 27818,
        "evidence": "Runner transcript invocation 03:28:50.717 UTC and final verdict 03:29:18.535 UTC."
      },
      "summary": "The slotted pointer and keyboard regression passed. Both short viewport cases passed in Chromium and WebKit, and the owner capture showed the selected options and Send after scrolling."
    }
  ]
}
```
