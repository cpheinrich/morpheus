---
roadmap: MO-26-10-12-12.24.34
---
# Detect web preview exit during readiness

Confirmed the original loop inspected only HTTP health and could wait360 iterations after the
launchd job exited. It now checks job liveness first, permits pending first launches, and surfaces
a bounded20-line/8KiB log tail on exit or readiness timeout. The supervisor also catches a child
that exited while its overlay was binding, before the exit listener was attached.

Added executable cases for missing/nonzero/zero/signal exits, pending then ready, live but
unhealthy360-attempt boundary, cancellation and a real Node child that exits23. Focused83tests
across qa-web-readiness/qa-web/qa-preview pass. Domain-specific changes reuse existing launchctl
and Node filesystem interfaces, with no dependency. Graph unavailable; exact source inspected.

Native macOS launchd reproduction: a temporary checkout ran a Node dev command exiting23.
Start failed in0.535seconds with supervisor exit1 and the actual fixture's failure/exit23 log
lines, then removed its job/state and stopped the owned preview. No unrelated preview touched.
Typecheck, compile, pm index, lint, inbox and diff checks passed.

After merging currentmain, full `pnpm test` passed2120tests across77files in69.07seconds.

Review WEB-EXIT-1 found launchd's actual pending sentinel `last exit code = (never exited)`
was mistaken for completion. Under the reviewer's exact-path condition, the author restricted
exit/signal matching to numeric values and added pending-sentinel and ran-without-status cases.
All84 focused QA tests, typecheck and compile passed; no extra review turn required.

Independent review conditionally cleared one substantive finding: launchd reports last exit code = (never exited) before a first launch, which the initial predicate rejected. Within the reviewer-approved paths, the author now recognizes only numeric exit/signal status, preserves missing-job and ran-without-PID detection, and adds both required regressions. All84 focused QA tests, typecheck and compile passed, satisfying the condition. The reviewer found no other defects and independently verified a native launchd fixture; no production action was performed.

```morpheus-review
{
  "version": 2,
  "base": "ed357bc641199748f2c14f83c50f779063a595fb",
  "reviewed": "e134af33a7deda9beadecf925968ce64bd8e531e",
  "covered": "8e2f0cbed9eabeacca84f62349abb2de55f70f14",
  "authorSession": "01a1317d-1201-7161-a2b9-b09e0a7fe8ab",
  "reviewerSession": "/root/review_web_exit",
  "risk": "normal",
  "elapsedMinutes": 3.8539,
  "timing": {
    "source": "clock",
    "durationMs": 231234,
    "evidence": "Reviewer /root/review_web_exit invocation start 2026-10-12T19:32:23.109833+00:00; completion observed 2026-10-12T19:36:14.343022+00:00."
  },
  "outcome": "complete",
  "summary": "Independent review conditionally cleared one substantive finding: launchd reports last exit code = (never exited) before a first launch, which the initial predicate rejected. Within the reviewer-approved paths, the author now recognizes only numeric exit/signal status, preserves missing-job and ran-without-PID detection, and adds both required regressions. All84 focused QA tests, typecheck and compile passed, satisfying the condition. The reviewer found no other defects and independently verified a native launchd fixture; no production action was performed.",
  "findings": [
    {
      "id": "WEB-EXIT-1",
      "severity": "substantive",
      "description": "The last exit code = (never exited) launchd sentinel falsely fails a pending first launch.",
      "paths": [
        "src/qa/preview/web.ts",
        "tests/qa-web-readiness.test.ts"
      ],
      "disposition": "fixed",
      "response": "Recognize numeric exit/signal only. Pending runs=0 with never-exited sentinel can become ready; runs=1 with no PID or status fails. Required focused checks passed.",
      "condition": {
        "paths": [
          "src/qa/preview/web.ts",
          "tests/qa-web-readiness.test.ts",
          "dist/qa/preview/web.js",
          "dist/qa/preview/web.js.map",
          "dist/qa/preview/web.d.ts",
          "docs/runbooks/qa-comments.md",
          ".agent/worklog/2026-10-12-detect-web-preview-exit.md"
        ],
        "evidence": "Recognize actual numeric exit/signal status, preserving missing-job and runs>0/no-PID failure detection. Ignore (never exited) for pending first launch. Add pending runs=0 plus sentinel becoming ready and runs=1 without PID or exit fields failing. Run the three focused QA test files, pnpm typecheck and pnpm compile; record passing results."
      },
      "conditionMet": "pnpm exec vitest run tests/qa-web-readiness.test.ts tests/qa-web.test.ts tests/qa-preview.test.ts:84passed; pnpm typecheck and pnpm compile passed. Only permitted paths changed in the fix commit."
    }
  ]
}
```
