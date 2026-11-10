---
date: 2026-11-09
roadmap: MO-26-11-09-15.45.51
tags: [engineering]
---

# Report a typed unattended gateway input rejection

Issue #663 reported a resumed Codex worker that started its thread, then rejected the rendered input before inference. Two retained local stderr logs use the typed input error field on a turn-start rejection. The process evidence confirmed a nonzero exit with verified cleanup and no started turn. The change recognizes that specific shape in a bounded private-log tail and returns only its stable code.

The CLI regression sends 1,048,575 bytes before handoff, then a synthetic provider refuses the enlarged resumed turn. It checks exit and cleanup proof, same status after deleting the cached result, omission for a message-only lookalike or started turn, and the absence of prompt and stderr markers in the output. All 25 unattended-worker tests passed, as did Factory source checks, root typecheck, compile, PM index and complexity.

Independent review cleared the exact gateway diagnostic with no findings. The reviewer independently reran the CLI and guardian regression, verified status reconstruction and the prompt and stderr privacy assertions, and checked the bounded reader and exact typed recognition.

```morpheus-review
{
  "version": 2,
  "base": "1ceddf210596de114193a8b44a8800f31303f1fc",
  "reviewed": "3c21dc2d20b1c92ea246f84b9fdc16cb13ade683",
  "covered": "3c21dc2d20b1c92ea246f84b9fdc16cb13ade683",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_gateway_diagnostic",
  "risk": "normal",
  "elapsedMinutes": 0.7514,
  "timing": {
    "source": "runner",
    "durationMs": 45084,
    "evidence": "Parent Codex transcript recorded dispatch at 2026-11-09T23:49:43.423Z and final verdict at 2026-11-09T23:50:28.507Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the exact gateway diagnostic with no findings. The reviewer independently reran the CLI and guardian regression, verified status reconstruction and the prompt and stderr privacy assertions, and checked the bounded reader and exact typed recognition.",
  "findings": []
}
```
