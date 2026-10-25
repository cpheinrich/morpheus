---
roadmap: MO-26-10-25-04.46.53
agent: codex
tags: [engineering, devops]
---

# Preserve QA submission confirmation

The parent CTO task authorized this small independent repair because a pre-existing QA status race blocked PR #505. Scope is the web overlay status, focused regression, generated output and explanatory QA docs. No cloud, credential, native-app or live user browser actions are included. The parent budget retains a 25% Codex reserve/75% use ceiling, with this initial implementation bounded to ten minutes and one normal-risk independent reviewer bounded to fifteen minutes. No paid fallback or reset is authorized.

CI run 40189494065 / job 121157291458 failed the Chromium legacy migration case at the Queued assertion on source 130a6075ea78aff69426b86d72d25b664d14d70b; all 37 other cases passed. Earlier unmodified QA source passed all 38 cases in run 40188790420. The failure is deterministic in mechanism: successful Send persists acknowledged removals, changing draftRevision; the next legacy cleanup retry calls setStatus with an empty primary message. This erases the confirmation while retaining the warning.

Primary action text/kind now survive independent warning refreshes. Warnings remain explicit and red; clearing one restores the primary status kind. No migration, consumed-index, persistence or Send semantics changed. This is a small domain-specific status correction, not a generic module, so no package or architecture change is needed.

Graph project Users-chrisheinrich-code-morpheus was ready (11112 nodes) at generation 2026-10-25T11:11:30Z. Coverage reported no recorded gaps for overlay-client.ts and the browser test, but nested functions in the raw JS template were absent from search results. Exact-checkout bootstrap check reported no worktree index; subsequent MCP coverage transport closed. Exact source fallback inspected the modified template, browser test, QA unit tests and runbook. No exhaustive graph claim is made.

## Validation

- pnpm typecheck — passed.
- pnpm exec vitest run tests/qa-web.test.ts — 38 tests passed; direct injected-client/server checks.
- pnpm exec playwright test tests/browser/qa-web-context.spec.ts --grep 'legacy route drafts' --workers=1 — Chromium and WebKit passed.
- Deliberately restored the old warning-clearing call, ran the regression in Chromium, and observed the expected failure: Queued missing after the post-acknowledgment cleanup attempt. Restored the fix immediately. Mutation trace/error context remain in ignored local/qa-status/mutation-results.
- The broader direct-status/storage browser run passed 15 of 16 cases. Its WebKit storage-failure fixture unexpectedly captured an image. A top-frame init-script guard also failed; a diagnostic then showed the top realm had the throwing methods and no prior sentinel, so that first hypothesis was disproved. Prefixing the served overlay with the same instance override also failed. Changing that override to IDBFactory.prototype.open passed in both browsers (2.1 seconds). Kept the final fixture small: the original init script now patches only the top realm and the factory prototype, and asserts the exact blocked-storage error, preserving its reload sentinel. Retained original failures/traces under local/qa-status/dependent-results and storage-fixture-results; diagnostic under storage-diagnostic-results.
- pnpm morpheus pm index; pnpm exec eslint src/qa/web/overlay-client.ts; git diff --check — passed.
- Final fixture check: pnpm exec playwright test tests/browser/qa-web-context.spec.ts --grep 'storage failures remain visible' --workers=1 --output=local/qa-status/storage-final-results — Chromium/WebKit both passed (2.0 seconds), including exact blocked-storage error, visible warning, queued batch and 30-pin limit. pnpm typecheck passed again after the test fixture correction. The other 15 direct status/storage cases already passed without changes.
- pnpm compile — passed; generated dist/qa/web/overlay-client.js and map included.
- Final screenshot run: QA_EVIDENCE_DIR="$PWD/local/qa-status/evidence" pnpm exec playwright test tests/browser/qa-web-context.spec.ts --grep 'legacy route drafts' --workers=1 --output=local/qa-status/final-results — both browsers passed. Each test observes exactly one post-acknowledgment cleanup attempt, retains Queued plus warning, clears only the warning on route departure, checks one POST and no pin replay after reload.

The author opened all four final screenshots and inspected both browsers: Queued and the warning remain visible together; only the warning disappears on route departure. Final screenshots are ignored local/qa-status/evidence/web-queued-{legacy-warning,warning-cleared}-{chromium,webkit}.png. Live preview adoption is outside this separate repair; the parent PR will merge this reviewed source from main and run its own final-head CI.

## Independent review correction QS-1

The fresh normal-risk initial reviewer /root/qa_status_ci_fix/qa_status_review completed a blocked initial review with one substantive finding. It inspected all four captures, independently passed four changed browser cases, and reproduced a second status overwrite: after acknowledgment saves empty v2 pins, the next legacy cleanup persist may fail and persist() replaces Queued with Draft could not be saved. Initial invocation was measured by the author from 2026-10-25T11:56:53.309Z to 2026-10-25T12:01:20.362Z (267053 ms, 4.4508833333333335 minutes). No conditional clearance was set; the original reviewer will assess the correction.

Added a deterministic second-empty-write regression: the first empty write acknowledges Send, the second fails cleanup persistence, then route retry with recovered storage succeeds on the third. The pre-fix Chromium run failed exactly at missing Queued; trace retained in local/qa-status/persist-negative-results. persist() now refreshes only the durable warning, so it cannot replace the action result. Existing draft warnings remain explicit. The new case also verifies one POST, no replay after reload and restored Queued success styling after recovery.

The direct failure checks caught an expected integration detail: an explicit Enter save must still replace the primary message with Draft could not be saved. Moved that action result to saveFocused(false), preserving the existing exact failed-save assertion and editable composer, while background persistence only refreshes warnings. The first correction run failed that assertion in both browsers and is retained in corrected-storage-results; it was not weakened or skipped.

Final QS-1 correction validation: pnpm compile; pnpm typecheck; pnpm exec vitest run tests/qa-web.test.ts (38 passed); pnpm exec eslint src/qa/web/overlay-client.ts; pm index; git diff --check all passed. Final browser command QA_EVIDENCE_DIR="$PWD/local/qa-status/evidence" pnpm exec playwright test tests/browser/qa-web-context.spec.ts --grep 'legacy route drafts|legacy cleanup write failure|failed sends|storage failures' --workers=1 --output=local/qa-status/final-correction-results passed all eight Chromium/WebKit cases (18.7 seconds). These include unchanged exact explicit-save failure assertions, both cleanup failure classes, successful recovery, one POST and no reload replay. Replaced the original four images and added web-queued-persist-{warning,recovered}-{chromium,webkit}.png. The author opened all eight final images and inspected Queued alongside each warning, with success styling after each recovery; no clipping/overlap was visible.

## Independent review outcome

The independent reviewer found one substantive persistence-retry status overwrite (QS-1). The author made background persistence refresh warnings, retained explicit Enter-save failure messages, and added a deterministic second-empty-write regression with recovery and replay checks. The same reviewer cleared the correction with no new findings, independently passed four focused Chromium/WebKit cases and inspected all eight final captures. Live preview adoption remains with the parent task; full CI is required before merge.

```morpheus-review
{
  "version": 2,
  "base": "e4ea3aa6fe14b3a9740efa1bde8ccd94c56b7d27",
  "reviewed": "95d7bf1468eacfeb1fb6caa2a8c798c0e1b7971b",
  "covered": "4f0af6052337a6af21774d2e3c3305a195341239",
  "authorSession": "01a172e4-146b-7180-979c-abc6db897869",
  "reviewerSession": "/root/qa_status_ci_fix/qa_status_review",
  "risk": "normal",
  "elapsedMinutes": 4.4508833333333335,
  "timing": {
    "source": "clock",
    "durationMs": 267053,
    "evidence": "Author actual clock around initial /root/qa_status_ci_fix/qa_status_review invocation: start 2026-10-25T11:56:53.309Z; final response received and completion observed 2026-10-25T12:01:20.362Z. Includes reviewer tool execution and waits."
  },
  "outcome": "complete",
  "summary": "The independent reviewer found one substantive persistence-retry status overwrite (QS-1). The author made background persistence refresh warnings, retained explicit Enter-save failure messages, and added a deterministic second-empty-write regression with recovery and replay checks. The same reviewer cleared the correction with no new findings, independently passed four focused Chromium/WebKit cases and inspected all eight final captures. Live preview adoption remains with the parent task; full CI is required before merge.",
  "findings": [
    {
      "id": "QS-1",
      "severity": "substantive",
      "description": "After acknowledgment successfully persists empty v2 pins, a failed importLegacy cleanup persist calls setStatus and erases Queued.",
      "paths": [
        "src/qa/web/overlay-client.ts",
        "dist/qa/web/overlay-client.js",
        "dist/qa/web/overlay-client.js.map",
        "tests/browser/qa-web-context.spec.ts"
      ],
      "disposition": "fixed",
      "response": "persist() now updates the durable warning through renderStatus without replacing the action result. Explicit saveFocused(false) failures keep their own error message. A new deterministic regression observes the second empty write fail after the acknowledgment, retains Queued plus warning, recovers on the third write with success styling, and verifies one POST and no replay. Pre-fix negative control failed at missing Queued. Same-reviewer follow-up cleared all changes."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/qa_status_ci_fix/qa_status_review",
      "commit": "4f0af6052337a6af21774d2e3c3305a195341239",
      "outcome": "cleared",
      "elapsedMinutes": 1.1554666666666666,
      "timing": {
        "source": "clock",
        "durationMs": 69328,
        "evidence": "Author actual clock around same-reviewer follow-up 1: start 2026-10-25T12:04:44.508Z; final response received and completion observed 2026-10-25T12:05:53.836Z. Includes reviewer tool execution and waits."
      },
      "summary": "QS-1 is fixed with no new findings or conditions. Independently passed the persistence-retry and failed-send/local-save cases in both browsers (four cases), inspected all eight final captures, and confirmed Queued remains alongside warnings and recovers success styling without replay."
    }
  ]
}
```
