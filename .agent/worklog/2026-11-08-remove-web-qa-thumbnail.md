---
date: 2026-11-08
roadmap: MO-26-11-08-00.27.40
agent: codex
tags: [engineering]
---

# Make room for web QA comments

Removed the inline placement JPEG from the web composer so the comment list gets its space. Kept the frozen JPEG attachment and image failure status. The browser comparison shows 138 px recovered on the fixture in Chromium and WebKit. The updated composer regression confirms the capture remains present and the thumbnail does not return when reopening a saved pin.

## Validation

- `pnpm exec playwright test tests/browser/qa-web-context.spec.ts --workers=1`: 36 passed.
- `pnpm typecheck`, `pnpm compile`, `morpheus complexity check` (two changed functions, CCN limit 15) and `git diff --check` passed.

## Independent review

Independent review cleared the change with no findings after inspecting the exact source and the synthetic Chromium and WebKit screenshots. The pin attachment and failure state remain intact. The reviewer inspected the browser test and relied on the author's run for execution.

The late CI correction only committed generated output. Independent verification reproduced all 799 tracked build files and found no source or browser test change. The author reran all 40 QA browser tests on Chromium and WebKit.

```morpheus-review
{
  "version": 2,
  "base": "6ac6063a1e7caa910c916c1effd1678528f2317d",
  "reviewed": "0c9134a77fb73e56bb15d0bd1a0d00a6c53b46a0",
  "covered": "0317087c103ace964da84ef04ea0a85ff6b65a3a",
  "authorSession": "01a1b31a-3c67-7941-bc8e-935345b8500b",
  "reviewerSession": "01a1ba47-bdbe-7971-9707-78fee0ce1290",
  "risk": "small",
  "elapsedMinutes": 1.74475,
  "timing": {
    "source": "runner",
    "durationMs": 104685,
    "evidence": "Factory run f8831416-0cdf-49d4-adae-a258069c0758, Codex turn 01a1ba47-bde7-7a73-8b8a-8fefc49a34a8 task_complete.duration_ms=104685."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the change with no findings after inspecting the exact source and the synthetic Chromium and WebKit screenshots. The pin attachment and failure state remain intact.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "01a1ba68-c6d3-7790-9e97-f93f68e54d4e",
      "commit": "0317087c103ace964da84ef04ea0a85ff6b65a3a",
      "base": "03c6f7eb5e66bc93f0f7074cc93d51f4e8197000",
      "outcome": "cleared",
      "elapsedMinutes": 1.8766833333333333,
      "timing": {
        "source": "runner",
        "durationMs": 112601,
        "evidence": "Factory run cb274bc7-d40c-4288-97ce-6e35e4648c09, Codex turn 01a1ba68-c707-7c30-86b1-d0bb23f2264d task_complete.duration_ms=112601."
      },
      "summary": "Generated overlay JavaScript and source map reproduce the previously reviewed source exactly. An archived build matched all 799 tracked dist files. The clean trunk merge reproduces and the source/test blobs are unchanged.",
      "scopeReason": "Late CI correction: commit the two regenerated overlay build outputs omitted from the first reviewed commit. A clean trunk merge supplies the current comparison base.",
      "handoff": {
        "reason": "The first reviewer completed; the prior Factory run cannot accept a continuation. The fresh reviewer received the original record and exact correction packet.",
        "findings": []
      }
    }
  ]
}
```
