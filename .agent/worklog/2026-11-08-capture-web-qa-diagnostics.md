---
date: 2026-11-08
roadmap: MO-26-11-08-01.38.38
agent: codex
tags: [engineering]
---

# Capture web QA build and view diagnostics

Extend the existing pin context with browser and OS families, pixel ratio, effective
CSS scheme, and the build identity declared by the preview operator. The active
view can opt in with a bounded flat snapshot of values it explicitly exposes.
Both sections freeze at the click and survive draft reload and Send. The old
context shape stays readable. Invalid optional view metadata is ignored at
capture. Posted diagnostics are also checked at the shared batch boundary.

Reused the existing pin capture, preview configuration and Zod validation.
Coarse classification needs only a few known browser/OS family patterns.
No dependency or new service is needed. App build identity remains unavailable
when the operator cannot verify the identity of what the preview serves.

## Validation

- 101 focused unit tests passed across web context, batch, preview lifecycle and readiness.
- New Chromium and WebKit fixtures verified frozen diagnostics through reload and Send.
  Both also verified usable pins with missing, invalid, private or out-of-view metadata.
- Typecheck, compile, PM index and diff whitespace passed. The complexity gate passed
  with an advisory for the existing `qaEndpoint` handler.

The initial full browser overlay suite passed all 44 tests in Chromium and WebKit.
Canonical lint passed.

## Independent review

Independent review found that excluded views could supply a snapshot when selected as the page fallback. The reviewer cleared the change on condition that only eligible active views supply snapshots. Both excluded-root browser regressions passed in Chromium and WebKit, and the generated runtime matches source.

Protected CI failed twice before running code validation because the exact
public actionlint download returned HTTP 504. A late reviewed correction adds the
official GitHub release-download fallback for the same pinned version, asset
and checksum. The reviewer identified the workflow's existing literal-URL
contract. Restoring that literal satisfied their condition. Actionlint 1.7.12,
243 focused workflow tests and the real fallback smoke with GNU SHA-256 passed.

```morpheus-review
{
  "version": 2,
  "base": "4629f043d307acdaa261d50f21ecfee97c895405",
  "reviewed": "c44d0534f88df7be10c9f778335802b46d0b9912",
  "covered": "9df224e3d369b4d0ddb2a38585f8956f71c7ad2b",
  "authorSession": "01a1ba85-55f3-7711-b18c-6264e88316eb",
  "reviewerSession": "/root/web_qa_diagnostics/independent_review",
  "risk": "normal",
  "elapsedMinutes": 2.2666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 136000,
    "evidence": "Author observed reviewer launch at 2026-11-08 09:46:38 UTC and completed conditional verdict at 2026-11-08 09:48:54 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review found that excluded views could supply a snapshot when selected as the page fallback. The reviewer cleared the change on condition that only eligible active views supply snapshots. Both excluded-root browser regressions passed in Chromium and WebKit, and the generated runtime matches source.",
  "findings": [
    {
      "id": "QA-WEB-DIAG-01",
      "severity": "substantive",
      "description": "When the active-view selector excludes the main root, its page fallback could still capture the opted-in snapshot from an aria-hidden or aria-modal=false root.",
      "paths": [
        "src/qa/web/overlay-client.ts"
      ],
      "disposition": "fixed",
      "response": "Only a selected eligible view can supply an opt-in snapshot. Existing page fallback pins still capture their ordinary context.",
      "condition": {
        "paths": [
          "src/qa/web/overlay-client.ts",
          "tests/browser/qa-web-context.spec.ts",
          "dist/qa/web/overlay-client.js",
          "dist/qa/web/overlay-client.js.map",
          "dist/qa/web/overlay-client.d.ts"
        ],
        "evidence": "Gate snapshot capture on active view eligibility. Browser regressions must omit aria-hidden=true and aria-modal=false fallback main snapshots while retaining usable pins, and the positive freeze/Send case must pass. Verify Chromium and WebKit diagnostics, typecheck, compile, complexity, and source/dist agreement."
      },
      "conditionMet": "Commit 4e931865 changes only the named source, browser spec, and generated JavaScript. All six targeted diagnostics tests passed across Chromium and WebKit, including both excluded roots and the positive freeze/Send case. Typecheck, compile and the complexity gate passed. A second compile produced no dist diff against the staged generated output."
    },
    {
      "id": "QA-WEB-CI-01",
      "turn": 2,
      "severity": "substantive",
      "description": "Splitting the pinned public actionlint URL into shell variables broke the existing workflow contract test that asserts the literal exact release URL.",
      "paths": [
        ".github/workflows/node-ci.yml",
        "tests/workflow-expressions.test.ts"
      ],
      "disposition": "fixed",
      "response": "Restore the original literal URL and name the exact same pinned version and filename in the GitHub CLI fallback. Retain the step-scoped token, partial-file overwrite, and common original checksum.",
      "condition": {
        "paths": [
          ".github/workflows/node-ci.yml"
        ],
        "evidence": "Restore the exact literal primary URL and exact literal tag and asset in the fallback. Preserve step-scoped token, overwrite of a partial file, and the original checksum before extraction. Run workflow-expressions tests, actionlint 1.7.12 on both workflows, and the exact edited download/checksum smoke with a partial curl file, real fallback and GNU SHA-256."
      },
      "conditionMet": "9df224e3 changes only node-ci.yml. All seven workflow-expressions tests and both actionlint checks passed. The exact edited workflow download/checksum prefix replaced a deliberately partial curl output via the actual gh fallback and passed the unchanged pinned GNU SHA-256 gate."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/web_qa_diagnostics/independent_review",
      "commit": "54922a6c6bacfa24986a0350e8fe03eda2e3cb17",
      "outcome": "cleared",
      "elapsedMinutes": 0.9,
      "timing": {
        "source": "clock",
        "durationMs": 54000,
        "evidence": "Author observed follow-up invocation at 2026-11-08 09:59:05 UTC and the completed conditional verdict at 2026-11-08 09:59:59 UTC."
      },
      "summary": "The reusable actionlint download fallback keeps the exact official asset and checksum. The reviewer conditionally cleared the one focused regression after restoring the literal pin required by the workflow contract.",
      "scopeReason": "Late CI correction: exact PR head failed twice at the public actionlint asset URL with HTTP 504 before code validation. Add an official route to the same pinned asset so required CI can validate this PR."
    }
  ]
}
```
