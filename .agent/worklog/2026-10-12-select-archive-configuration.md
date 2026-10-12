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
  "covered": "a0d6474e500bd5e7ad524b24b51d604fa0da25f8",
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
  "findings": []
}
```
