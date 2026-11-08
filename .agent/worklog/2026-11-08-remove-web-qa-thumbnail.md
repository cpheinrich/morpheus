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

```morpheus-review
{
  "version": 2,
  "base": "6ac6063a1e7caa910c916c1effd1678528f2317d",
  "reviewed": "0c9134a77fb73e56bb15d0bd1a0d00a6c53b46a0",
  "covered": "0c9134a77fb73e56bb15d0bd1a0d00a6c53b46a0",
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
  "findings": []
}
```
