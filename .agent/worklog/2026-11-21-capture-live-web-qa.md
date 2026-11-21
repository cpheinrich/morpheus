---
date: 2026-11-21
roadmap: MO-26-11-21-00.05.31
tags: [engineering, qa]
summary: Capture a redacted image and browser diagnostics for each live website QA pin.
---

# Capture live web QA screenshots and diagnostics

The prior production contract contained placement geometry and an optional explicit anchor.
The shared component now freezes a redacted viewport and bounded browser data at placement,
keeps them with the draft, and sends the same payload when a receipt is lost. The two host
adapters write an indexed evidence document per pin in the batch commit. Capture failure is
shown in the pin list, and text can still be submitted.

Reused the project's pinned modern-screenshot package to rasterize an inert snapshot. The
projection omits external styles and unsupported media and uses the existing private marker.
No new dependency is needed. Two browser engines exercise pick-time pixels, copy masking,
failure feedback, and byte-identical retry.

The first delegated implementation ended after interrupted supervision with verified cleanup
and no patch. The retry returned a checksum-verified patch from the exact published claim.
Local verification found that headless Chromium reports `HeadlessChrome` in the user agent.
The parser now retains that browser family and its version. The controller also factored
image validation and capture helpers to satisfy the repository's enforced complexity limit.

Visual review of the first host captures showed the photo omitted and the Evo heading wrapping
where the built page did not. The capture now retains installed font names and compresses
readable media before applying its budget. A new Chromium and WebKit pixel assertion proves
that readable canvas content is still present alongside the masked regions. The production
panel suite passed all eight cases after this refinement. The preceding full browser suite
passed 54 cases, and the 128 focused unit checks passed again after the refinement.

The capture carries the open state of native disclosure panels without copying their other
attributes. A checked pixel inside the expanded panel passed on Chromium and WebKit. Each
engine still passed the redaction, media, pin timing, and exact retry checks.

## Independent review

The fresh Fleet reviewer cleared the exact candidate after an earlier host-supervisor interruption. It inspected all four synthetic capture images and verified the evidence boundary, placement time, and exact retry. Both site integrations then passed browser-to-Firestore readback against the same packaged runtime.

The controller also reran the exact packaged runtime in both site builds. Darwin verified
JPEG sizes of 39,327 and 39,461 bytes, expected blue and green pixels, and a gray mask pixel
at [101, 105, 114]. Evo's four emulator tests passed, including the distinct attachments,
private reads and changed-evidence conflict. The first reviewer never issued a verdict.
The fresh reviewer used direct cited source reads after the context index failed and opened
the checksum-matched offline contact sheet. The controller supplied the passing test evidence.

```morpheus-review
{
  "version": 2,
  "base": "1170c92160f1609fb55f3c5c441ddb4ea1127aad",
  "reviewed": "adcf3e7d660ea86bdd81e9bf9412b897d9dec3f0",
  "covered": "adcf3e7d660ea86bdd81e9bf9412b897d9dec3f0",
  "authorSession": "01a1fb82-04ac-7af0-aa4f-7d383254c3ab",
  "reviewerSession": "dd8d9d29-fbd6-462c-8fe7-04fffff7d097",
  "risk": "high",
  "elapsedMinutes": 0.12813333333333332,
  "timing": {
    "source": "runner",
    "durationMs": 7688,
    "evidence": "Guardian process.json for admission 8329f443-3b3a-4d1c-8833-dd26574ff36a; monotonic duration includes owned cleanup."
  },
  "initialOutcome": "incomplete",
  "outcome": "complete",
  "summary": "The fresh Fleet reviewer cleared the exact candidate after an earlier host-supervisor interruption. It inspected all four synthetic capture images and verified the evidence boundary, placement time, and exact retry. Both site integrations then passed browser-to-Firestore readback against the same packaged runtime.",
  "contextRead": [
    "AGENTS.md",
    "hq/product/roadmap/MO-26-11-21-00.05.31-capture-live-qa-evidence.md",
    "qa/acceptance/production-web-qa.md",
    "docs/runbooks/qa-comments.md",
    "architecture.md",
    ".agent/worklog/2026-11-21-capture-live-web-qa.md",
    ".agent/worklog/2026-11-15-ship-web-qa-comments.md"
  ],
  "findings": [
    {
      "id": "R755-01",
      "turn": 2,
      "severity": "minor",
      "description": "Readable live-video frames can be copied unless the host marks the region private.",
      "paths": [
        "src/qa/web/evidence.ts"
      ],
      "disposition": "disputed",
      "response": "The released Darwin and Evo surfaces expose no live capture streams. The documented host privacy marker controls future sensitive media and no new camera or screen access is acquired."
    },
    {
      "id": "R755-02",
      "turn": 2,
      "severity": "minor",
      "description": "The integrator runbook omits the exact evidence index field and child path.",
      "paths": [
        "src/qa/guide.ts",
        "docs/runbooks/qa-comments.md",
        "architecture.md"
      ],
      "disposition": "disputed",
      "response": "The shared reader guide and both concrete host runbooks already specify the exact zero-based evidence index and path. The generic runbook describes the host responsibility."
    },
    {
      "id": "R755-03",
      "turn": 2,
      "severity": "minor",
      "description": "Touch and pen activation use the primary click label.",
      "paths": [
        "src/qa/web/mount.ts"
      ],
      "disposition": "disputed",
      "response": "The accepted evidence records pointer activation, context-menu activation, keyboard activation or a page pin. Separate hardware pointer types would evolve the host payload."
    },
    {
      "id": "R755-04",
      "turn": 2,
      "severity": "minor",
      "description": "The reviewer sheet omits the on-page capture-status lines.",
      "paths": [
        "src/qa/web/mount.ts",
        "tests/browser/qa-web-production.spec.ts"
      ],
      "disposition": "fixed",
      "response": "The draft includes the exact Darwin and Evo panel captures with both Screenshot attached lines. The final shared Playwright suite also verifies the unavailable label and Send behavior."
    },
    {
      "id": "R755-05",
      "turn": 2,
      "severity": "minor",
      "description": "The review packet describes the exact host readback as in progress.",
      "paths": [
        ".agent/worklog/2026-11-21-capture-live-web-qa.md"
      ],
      "disposition": "fixed",
      "response": "Both production-mode site builds pinned to adcf3e7 passed exact synthetic attachment readback, private client denial, and rejection of changed evidence. Darwin decoded its redaction pixels and Evo passed the four browser integration cases."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "d438195f-e8a8-4fad-aebc-9188f2ab3656",
      "commit": "adcf3e7d660ea86bdd81e9bf9412b897d9dec3f0",
      "outcome": "cleared",
      "elapsedMinutes": 8.800533333333334,
      "timing": {
        "source": "runner",
        "durationMs": 528032,
        "evidence": "Guardian process.json for admission c8f8cf8d-ad54-4cae-9f49-e3d66b2f51c0; monotonic duration includes owned cleanup."
      },
      "summary": "The fresh reviewer opened the checksum-matched Chromium and WebKit evidence, verified the exact pin state, masks, media, open disclosure and retry contract, and reported five nonblocking findings.",
      "handoff": {
        "reason": "The previous worker lost runner authority during a host supervisor restart and returned no verdict or findings.",
        "findings": []
      }
    }
  ]
}
```
