---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.50.06
outcome: review
---

# Diagnose unavailable nightly signing credentials

Issue #194 is distinct from the caller-owned upload boundary fixed by #193/#192. The built-in
job still needs an early explanation when required credentials are unavailable. PR #195 adds
a caller template and does not address this diagnostic; its owner branch remains untouched.

The first upload step now receives only boolean presence flags for the five required signing
secrets. It fails with missing names and conditional guidance for cross-repository callers to
use `run-upload: false` and the caller-owned action in their protected environment. It does not
infer repository identity from `github.workflow_ref`, relocate secrets, or require optional
Firebase/Sentry credentials or a nonempty P12 password. Values first enter the final upload step.

## Validation

The new test failed against the original workflow because checkout was still the first step.
It executes the actual guard shell for all credentials present, each required secret absent,
and all required secrets absent. The test verifies that the guard receives only presence flags.
Typecheck, all 1,145 tests, compilation, PM index, and inbox validation passed. After the audited main integration, frozen install, lint, typecheck, all1,298 tests,
compilation and PM index passed. After PR235 integration all130 workflow tests and all1,299 tests passed.
Graph coverage calls returned Transport closed; current workflow and test sources were read directly. No signed build, credential access,
TestFlight upload, or production activation is performed by this change.

## Independent review



Independent review found no substantive or minor issues at the exact current remote head. All five focused nightly workflow tests passed on macOS Bash3.2. A separate pre-existing blank-P12-password rejection in the caller-owned upload action was reproduced with synthetic inputs and deferred. No disagreement or follow-up review is required; stale graph coverage was supplemented with exact-source inspection.

```morpheus-review
{
  "version": 1,
  "base": "0f469a136dfcf0405c54ff9521a6d43b68de5637",
  "reviewed": "61726060e1e927ffeecf593476fae516f9220ebc",
  "covered": "61726060e1e927ffeecf593476fae516f9220ebc",
  "authorSession": "01a08ebd-2cd3-7923-a70e-94bf73e90da3",
  "reviewerSession": "/root/review_upload_diagnostic",
  "risk": "high",
  "elapsedMinutes": 2.1,
  "outcome": "complete",
  "summary": "Independent review found no substantive or minor issues at the exact current remote head. All five focused nightly workflow tests passed on macOS Bash3.2. A separate pre-existing blank-P12-password rejection in the caller-owned upload action was reproduced with synthetic inputs and deferred. No disagreement or follow-up review is required; stale graph coverage was supplemented with exact-source inspection.",
  "findings": [
    {
      "id": "I1",
      "severity": "incidental",
      "description": "The existing caller-owned ios-testflight-upload script requires a nonempty P12 password and rejects an unencrypted PKCS12 identity.",
      "paths": [
        ".github/actions/ios-testflight-upload/upload-testflight.sh"
      ],
      "disposition": "deferred",
      "response": "Retained in the automation follow-up ledger with reviewer reproduction of the validation prefix. This diagnostic does not change the separate action or worsen its pre-existing behavior."
    }
  ]
}
```
