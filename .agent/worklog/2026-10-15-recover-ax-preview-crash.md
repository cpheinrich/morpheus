# Recover QA preview from accessibility crashes

Issue #397 records an Evo QA preview SIGSEGV in Apple's AX bridge. The browser's AX subscription ran inside the launchd supervisor, so the native crash also killed serve-sim and its MJPEG stream. Evo's worklog had already verified that removing the AX subscription let the overlay show live frames and persist batches.

I added explicit `--no-ax` to standalone and managed iOS previews. It suppresses AX stream, proxy and placement routes while retaining screenshot-frame pins, HID input and batch submission. Managed previews now launch the overlay in a child process. If it exits unexpectedly, the supervisor leaves serve-sim running and retries once with AX disabled; a second exit is logged rather than retried indefinitely. The overlay remains owned by the preview supervisor for stop and lease expiry.

Focused tests: `pnpm exec vitest run tests/qa-preview.test.ts tests/qa-comments.test.ts` (preview lifecycle, fallback restart and comment routes/batches). Typecheck: `pnpm typecheck`. No local full suite: this change stays in QA/CLI code, outside the shared core paths that require it. CI runs the full suite. No macOS simulator was launched in this worktree; the native SIGSEGV is not reliably reproducible in a unit test, so the tests exercise the process-exit boundary and the screenshot fallback contract.

Initial independent review identified QA-1: a tab already open during an AX crash retained its AX-only JavaScript and could no longer submit new pins after the server restarted in screenshot mode. I added health-mode detection on the AX stream error path. Once the fallback is healthy, the tab persists its draft and reloads into screenshot mode; the existing session storage and frame store restore unsent pins. The focused QA tests now pass 77/77, with typecheck passed. The native crash itself remains intermittent and was not recreated locally.

The independent review found one substantive issue: an open AX tab did not switch to screenshot mode after the overlay restarted. I added health-mode detection and an automatic reload that preserves the draft and captured frames. The same reviewer cleared the correction; no further findings remained. Focused tests, typecheck, compile, and index passed. The native SIGSEGV was not reproduced during review.

```morpheus-review
{
  "version": 2,
  "base": "e8262bb3ea546174310cbc9e2a77a427f9be8803",
  "reviewed": "bc5558ef10daf9c19b371048ad0e5c9f498eb20f",
  "covered": "0ffc9f72501872227836b74aca935d26ed6286dd",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/qa_ax_review",
  "risk": "high",
  "elapsedMinutes": 2.533333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 152000,
    "evidence": "Author UTC clock readings around initial /root/qa_ax_review turn: 2026-10-15T08:32:25Z to 2026-10-15T08:34:57Z, including tool execution and wait."
  },
  "outcome": "complete",
  "summary": "The independent review found one substantive issue: an open AX tab did not switch to screenshot mode after the overlay restarted. I added health-mode detection and an automatic reload that preserves the draft and captured frames. The same reviewer cleared the correction; no further findings remained. Focused tests, typecheck, compile, and index passed. The native SIGSEGV was not reproduced during review.",
  "findings": [
    {
      "id": "QA-1",
      "severity": "substantive",
      "description": "An existing AX tab kept its AX-only JavaScript when the overlay restarted in screenshot mode, so new pins called the disabled placement route and could not be submitted.",
      "paths": ["src/qa/overlay-page.ts", "src/qa/preview/supervisor.ts"],
      "disposition": "fixed",
      "response": "The AX stream error handler now waits for the overlay health mode to report accessibility disabled, persists the draft, and reloads. Screenshot mode restores unsent pins and frames; focused QA tests passed 77/77 and the same reviewer cleared the correction."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/qa_ax_review",
      "commit": "0ffc9f72501872227836b74aca935d26ed6286dd",
      "outcome": "cleared",
      "elapsedMinutes": 2.4166666666666665,
      "timing": {
        "source": "clock",
        "durationMs": 145000,
        "evidence": "Author UTC clock readings around same-reviewer QA-1 follow-up: 2026-10-15T08:36:22Z to 2026-10-15T08:38:47Z, including tool execution and wait."
      },
      "summary": "QA-1 cleared: the open tab reloads into screenshot mode after the child fallback becomes healthy, restoring saved drafts and frames; no new regressions found."
    }
  ]
}
```
