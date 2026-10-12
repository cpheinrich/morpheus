---
roadmap: MO-26-10-12-12.30.40
---
# Select archive configuration and preserve spaced names

Verified #325 in the composite action and both xcodebuild configuration sites. Added a Release-
defaulted configuration input, wrote BUILD_CONFIGURATION through the validated job environment,
and used it in metadata and archive argument construction. Scheme/configuration retain spaces,
while blanks and CR/LF fail before GITHUB_ENV mutation. Path restrictions remain unchanged.

New executable tests run the actual validation shell prefix and actual metadata/archive shell
blocks with a logging Xcode stand-in, proving default/override consistency, one-argument spaced
names, literal shell-looking data, and blank/CR/LF refusal. Removed superseded source-text checks.
The first test asserted an irrelevant environment-line ordering; replaced it with exact key/value
assertions. No new dependency or live signing/upload. Graph tools unavailable; source fallback.

Validation: frozeninstall;169 focusedtests across upload-configuration/workflows/upload-receipt/signing-lock; typecheck,compile,pmindex,lint,inbox,bashsyntax,diffchecks passed. Fullpnpmtest passed2122tests/77files in71.71seconds.

Independent high-risk review cleared the exact remote head with no findings. The reviewer verified configuration propagation through both metadata queries and the archive, quoted scheme/path handling, validation before environment writes, and compatibility with sampled callers; all 10 configuration tests passed independently. No actual archive, signing, or upload was performed. Exact worktree source supplied coverage where the primary graph lacked new files.

```morpheus-review
{
  "version": 2,
  "base": "01bdb63b53f5db34da05910fbce1aa9c12bcf2c7",
  "reviewed": "a0d6474e500bd5e7ad524b24b51d604fa0da25f8",
  "covered": "d0b1e8f26d25a16477251dd3143c366e428d2b72",
  "authorSession": "01a1317d-1201-7161-a2b9-b09e0a7fe8ab",
  "reviewerSession": "/root/review_archive_configuration",
  "risk": "high",
  "elapsedMinutes": 2.372133333333333,
  "timing": {
    "source": "clock",
    "durationMs": 142328,
    "evidence": "Reviewer /root/review_archive_configuration invocation start 2026-10-12T19:38:37.364569+00:00; completion observed 2026-10-12T19:40:59.692454+00:00."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the exact remote head with no findings. The reviewer verified configuration propagation through both metadata queries and the archive, quoted scheme/path handling, validation before environment writes, and compatibility with sampled callers; all 10 configuration tests passed independently. No actual archive, signing, or upload was performed. Exact worktree source supplied coverage where the primary graph lacked new files.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/review_archive_configuration",
      "commit": "d0b1e8f26d25a16477251dd3143c366e428d2b72",
      "scopeReason": "Late CI correction: review fixture cleanup failed ENOTEMPTY after the initial clearance; asynchronous removal rescans late files within the same retry bounds.",
      "outcome": "cleared",
      "elapsedMinutes": 1.9064166666666666,
      "timing": {
        "source": "clock",
        "durationMs": 114385,
        "evidence": "Same-reviewer follow-up invocation start 2026-10-12T19:49:26.076767+00:00; completion observed 2026-10-12T19:51:20.461082+00:00."
      },
      "summary": "The same reviewer cleared the late CI cleanup correction with no findings. Vitest awaits the returned removal promise and reports cleanup rejection as failure; assertions and retry bounds are unchanged. The reviewer independently reproduced the Node 22.23.3 late-file probe. All 136 focused review/configuration tests, typecheck and lint passed; the actual CI writer remains unknown."
    }
  ]
}
```

## Late CI correction: fixture cleanup

CI run 38299683141 passed all archive-configuration tests but failed review-fixture cleanup
with ENOTEMPTY under .git/objects, despite the existing bounded synchronous retries. Node
22.23.3 source shows synchronous removal retries rmdir without rescanning children, whereas
async removal repeats traversal. A deterministic probe inserts one file after traversal:
Node 22.23.3 sync removal fails ENOTEMPTY and leaves it; async removal removes it and the root.
This reproduces the cleanup mechanism, not proof of which process wrote the CI file.

Changed only this suite's afterEach to return bounded async rm, which Vitest awaits. Existing
assertions and cleanup-error propagation remain intact. No new cleanup module or dependency.
Node source: https://github.com/nodejs/node/blob/v22.23.3/lib/internal/fs/rimraf.js
The previously failing test passed in isolation before the change, confirming its assertion
was not the reported failure. The same independent reviewer assessed this late CI correction.

The same reviewer cleared the late CI cleanup correction with no findings. Vitest awaits the returned removal promise and reports cleanup rejection as failure; assertions and retry bounds are unchanged. The reviewer independently reproduced the Node 22.23.3 late-file probe. All 136 focused review/configuration tests, typecheck and lint passed; the actual CI writer remains unknown.
