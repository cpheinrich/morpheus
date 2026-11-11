---
date: 2026-11-09
roadmap: MO-26-11-09-15.32.39
tags: [engineering]
---

# Keep an unstructured Claude result out of live status

Issue #613 showed a resumed worker still running after an unstructured provider result, while the fallback made it appear to need input. The fallback is now private until the worker exits. A later structured report wins. Otherwise exit yields a failure diagnostic. Existing structured reports, actual control requests and exit handling retain their paths.

The Manager regression verifies the public state, question and result before exit, then checks terminal status with and without a later report. All 12 focused Manager and Claude tests passed, as did the Factory source check, root typecheck, compile, PM index and enforced complexity.

Independent review cleared the lifecycle change and independently reran all 12 focused tests. A minor wording note clarified that the fallback concerns a non-error result and ordinary exit. Live gateway verification was outside the synthetic test scope.

```morpheus-review
{
  "version": 2,
  "base": "7fc6a8d2ad5af754608a823783c716e7a3db647b",
  "reviewed": "e079bc888e2fec808637d5f5315fd595d0ebf5f9",
  "covered": "d00bd46705af68d8843e69a556e7a17caf2e8c7e",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_claude_result",
  "risk": "normal",
  "elapsedMinutes": 0.8284166666666667,
  "timing": {
    "source": "runner",
    "durationMs": 49705,
    "evidence": "Parent Codex transcript recorded dispatch at 2026-11-09T23:35:54.678Z and final verdict at 2026-11-09T23:36:44.383Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the lifecycle change and independently reran all 12 focused tests. A minor wording note clarified that the fallback concerns a non-error result and ordinary exit. Live gateway verification was outside the synthetic test scope.",
  "findings": [
    {
      "id": "FR-1",
      "severity": "minor",
      "description": "The README described the fallback as applying to explicit provider errors and interrupted exits.",
      "paths": [
        "plugins/factory/README.md"
      ],
      "disposition": "fixed",
      "response": "Clarified non-error results and ordinary exits; the reviewed runtime behavior already preserves explicit errors and interruption."
    }
  ]
}
```
