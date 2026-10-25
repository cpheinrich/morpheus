---
date: 2026-10-24
roadmap: MO-26-10-24-21.07.10
agent: codex
---

# Align printed QA guide with placement evidence

Issue #484 was confirmed against the installed #483 runtime: `morpheus qa guide` still told responders to use web batch-level whole-page PNGs. The runbook and actual schema already define primary `comment.webContext` plus per-comment viewport JPEGs, so these stale instructions could map full-page normalized anchors onto viewport pixels.

Updated only the printed guide, focused regression coverage and generated output. It now separates current web semantic context/JPEGs, iOS placement PNGs and legacy Send-time frames. It names the actual viewport point, original window/nested scroll, nominal scale and exact encoded per-axis scales, including a frame/viewport dimension fallback when exact scales are absent. Scope, omitted media and image failure remain explicit. No capture code, dependency, installed CLI, preview, browser tab or responder was changed.

The previous guide test covered web preview startup and selectors but not evidence types or coordinate spaces; the new regression asserts those distinctions and rejects the old blanket claims. No browser screenshots were generated: this change affects printed operating prose, and pixels would not validate it. The existing #483 runbook and schema are the contract, not a new architecture decision.

Validation: `pnpm exec vitest run tests/qa-web.test.ts` — 38 passed; `pnpm typecheck`, `pnpm lint`, `pnpm compile` and `pnpm morpheus pm index` passed. The compiled `node dist/cli/index.js qa guide` output was inspected at `/tmp/morpheus-updated-qa-guide.txt`. Focused scope covers the changed guide and its existing web-preview consumers; CI owns the full suite. Tier 2 graph discovery found `QA_GUIDE` as the guide variable, with no inbound call trace edges (not proof of no consumers). Coverage for guide/schema/runbook/tests reported no recorded gaps at generation `2026-10-25T04:07:14Z`; actual worktree source and compiled CLI output are the evidence for this correction.

The fresh independent reviewer found no defects and cleared the printed guide through d9ca9ff059b90ef93da9f2cb7e190524cafc7e7a. The reviewer checked schema, capture code, runbook, regression assertions and compiled output; no browser interaction or capture behavior changed.

```morpheus-review
{
  "version": 2,
  "base": "9eb29f2e941dda7f44e87c51fdc0ac734469665b",
  "reviewed": "d9ca9ff059b90ef93da9f2cb7e190524cafc7e7a",
  "covered": "d9ca9ff059b90ef93da9f2cb7e190524cafc7e7a",
  "authorSession": "01a17121-d469-73a1-b304-3d770aabf560",
  "reviewerSession": "/root/morpheus_web_pin_fix/qa_guide_review",
  "risk": "normal",
  "elapsedMinutes": 1.1162166666666666,
  "timing": {
    "source": "clock",
    "durationMs": 66973,
    "evidence": "Clock/Date.now around fresh reviewer invocation: 2026-10-25T04:09:17.659Z to 2026-10-25T04:10:24.632Z (1792901357659 to 1792901424632), runner-issued /root/morpheus_web_pin_fix/qa_guide_review."
  },
  "outcome": "complete",
  "summary": "The fresh independent reviewer found no defects and cleared the printed guide through d9ca9ff059b90ef93da9f2cb7e190524cafc7e7a. The reviewer checked schema, capture code, runbook, regression assertions and compiled output; no browser interaction or capture behavior changed.",
  "findings": []
}
```
