---
roadmap: MO-26-10-12-12.03.33
---
# Preserve TestFlight upload acceptance

Issue #299 reproduced in the current action: `builds upload`, processing, beta groups and
beta review shared one failing shell step. Apple transport acceptance was lost as independent
evidence when a later operation failed.

Separated acceptance from distribution. A create-only, fsynced JSON receipt contains an
allowlist of release and GitHub identity fields. The existing pinned official artifact action
persists that one file before any processing/distribution work. Names distinguish runs,
attempts and invocations; no overwrite or raw API response. No receipt remains uncertain,
including cancellation between Apple acceptance and artifact persistence. Retention is 90 days.
The signing lock and cleanup stay around archive/export/upload; distribution receives only ASC
credentials and cleans its own temporary key. No scheduler adoption or release activation.

This is a domain-specific receipt contract using Python standard library and the existing
pinned actions/upload-artifact, with no generic storage module or package dependency.

Validation: frozen-lockfile install; pnpm typecheck; pnpm compile; pnpm morpheus pm index;
pnpm lint; pnpm morpheus inbox validate; bash -n on all three shell scripts;
pnpm exec vitest run tests/upload-receipt.test.ts tests/workflows.test.ts tests/signing-lock.test.ts
(159 tests). The receipt test executes seven Python cases, including the real upload boundary
and distribution script with a synthetic ASC CLI: no acceptance before upload, ambiguous responses,
exact allowlisted fields, create-only writes, failed retries, processing failure, and group failure.
The initial receipt tests failed on the missing implementation; the first integration run exposed
two existing tests still reading the moved beta-review code, corrected to its new script.
The full pnpm test run passed all 2,106 tests across 75 files (63.97 seconds).

No real Apple upload, signing material, production deployment, or beta distribution was used.
Graph-first discovery used current primary generation 2026-10-12T19:01:36Z and clean recorded
coverage for the original action/tests. Worktree bootstrap succeeded with configuration ownership
warnings; the active MCP transport then closed, so new files and moved code were read directly.

Independent review RCP-001 reproduced false acceptance for absent, awaiting and unknown states.
Verified pinned asccli v0.18.2 SDKBuildUploadRepository.swift returns the current upload state
and defaults missing state to AWAITING_UPLOAD. Acceptance now requires PROCESSING or COMPLETE;
awaiting is boundedly polled and resource identity must remain stable. Added positive-state,
unknown/absent/awaiting, deadline and mismatched-id regressions.

RCP-002 identified a new allocation race when signing cleanup releases the account lock before
processing exposes the accepted build. A small domain-specific standard-library helper reserves
per-app/version numbers under that same lock before archive. Later automatic allocation uses
max(Apple next, reserved + 1). Explicit numbers retain existing meaning and update the floor.
A delayed-visibility regression proves consecutive API suggestions of42 allocate42 then43;
other app/version trains remain independent, newer server numbers win, and corrupt local state
fails closed. No new dependency: this is a domain-specific reservation of fewer than50 lines.

After review fixes: nine executable Python receipt/reservation regressions passed; all159 focused Vitest tests passed, plus typecheck, compile, pm index, lint, bash syntax and diff checks. Full suite was already run once for this PR; required CI verifies the final revision.

Independent review found two substantive defects: unconfirmed upload states could produce accepted receipts, and splitting processing from signing exposed a build-number visibility race. The author added positive-state confirmation with stable upload identity and account-locked per-app/version number reservations. The same reviewer cleared both fixes and their regressions on the exact remote revision, with no new findings. Nine executable Python regressions passed independently; no live signing or upload was performed.

```morpheus-review
{
  "version": 2,
  "base": "b998aaf4596935e26dd7c9565e48fa9253f8377f",
  "reviewed": "816f483a2ba62bb3213290f12c3c9dd13da6caee",
  "covered": "ee7347bd8aba19cc12236738b17ff101f047a741",
  "authorSession": "01a1317d-1201-7161-a2b9-b09e0a7fe8ab",
  "reviewerSession": "/root/review_upload_receipts",
  "risk": "high",
  "elapsedMinutes": 6.69495,
  "timing": {
    "source": "clock",
    "durationMs": 401697,
    "evidence": "Reviewer /root/review_upload_receipts invocation start 2026-10-12T19:10:11.340458+00:00; completion observed 2026-10-12T19:16:53.037322+00:00."
  },
  "outcome": "complete",
  "summary": "Independent review found two substantive defects: unconfirmed upload states could produce accepted receipts, and splitting processing from signing exposed a build-number visibility race. The author added positive-state confirmation with stable upload identity and account-locked per-app/version number reservations. The same reviewer cleared both fixes and their regressions on the exact remote revision, with no new findings. Nine executable Python regressions passed independently; no live signing or upload was performed.",
  "findings": [
    {
      "id": "RCP-001",
      "severity": "substantive",
      "description": "An id with AWAITING_UPLOAD, absent or unknown state was recorded as accepted before transport confirmation.",
      "paths": [
        ".github/actions/ios-testflight-upload/upload-receipt.py",
        ".github/actions/ios-testflight-upload/upload-testflight.sh",
        "tests/upload-receipt.test.py"
      ],
      "disposition": "fixed",
      "response": "Require PROCESSING or COMPLETE and no errors, poll AWAITING_UPLOAD within the existing bound, and reject changed upload identity. Executable success, ambiguity, timeout and identity regressions passed; reviewer cleared."
    },
    {
      "id": "RCP-002",
      "severity": "substantive",
      "description": "Releasing the signing lock before processing exposes a duplicate automatic build number while Apple builds still omits the accepted upload.",
      "paths": [
        ".github/actions/ios-testflight-upload/action.yml",
        ".github/actions/ios-testflight-upload/upload-testflight.sh",
        ".github/actions/ios-testflight-upload/build-number.py",
        "tests/upload-receipt.test.py"
      ],
      "disposition": "fixed",
      "response": "Reserve per-app/version numbers persistently under the existing account lock before archive, use max(Apple next,reserved+1) for automatic allocation, preserve explicit input meaning and fail closed on corruption. Delayed-visibility regression allocates42 then43 for repeated suggestion42; reviewer cleared."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_upload_receipts",
      "commit": "ee7347bd8aba19cc12236738b17ff101f047a741",
      "outcome": "cleared",
      "elapsedMinutes": 1.4765166666666667,
      "timing": {
        "source": "clock",
        "durationMs": 88591,
        "evidence": "Reviewer /root/review_upload_receipts invocation start 2026-10-12T19:20:39.213799+00:00; completion observed 2026-10-12T19:22:07.804595+00:00."
      },
      "summary": "RCP-001 and RCP-002 resolved. No new findings; all nine Python regressions passed. Graph unavailable, so exact new source inspected directly."
    }
  ]
}
```
