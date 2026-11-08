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

```morpheus-review
{
  "version": 2,
  "base": "4629f043d307acdaa261d50f21ecfee97c895405",
  "reviewed": "c44d0534f88df7be10c9f778335802b46d0b9912",
  "covered": "4e9318655cba4f911af24073116192d690220450",
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
    }
  ]
}
```
