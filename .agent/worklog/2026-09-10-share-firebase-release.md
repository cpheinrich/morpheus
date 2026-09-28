---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.58.31
outcome: review
---

# Share Firebase deployment and client readiness

Inspected Evo PR205 at 6988523cd2ddd73ba41ca35ddc2f0b501178406d: release.mjs, its tests, the caller
verification action, backend/TestFlight/Vercel workflows and activation runbook. The current user
request authorizes merging the shared extraction for #221; Evo PR205 itself remains held and no
production deployment, activation, credentials or spending are authorized by this maintenance run.

The shared composite action retains caller-owned protected credentials and a documented single
non-cancelling lock covering backend writes plus entire client publication. Project IDs/rule paths
stay in the consumer's tracked policy. The CLI reads immutable tested Git blobs, checks current
main before deployment and on both sides of verification, generates an explicit rules-only config,
and requires live exact-content rules and READY indexes after the ten-minute propagation window.
Receipt paths now hash the exact credential-free bytes, strengthening Evo's plain receipt filename.
Scoped Storage deploy config uses explicit bucket arrays, confirmed against official firebase-tools
storage prepare code, so default bucket inference cannot target a different bucket.

Borrowed official firebase-tools 15.29.0 (registry publication 2026-09-02, 70 CLI dependencies) and
google-github-actions/auth v3. No application dependency is added. Node built-ins implement only the
domain-specific source/readiness/receipt policy; package-managed deployment/auth were not rebuilt.
The exact CLI version matches the first consumer. Extended index options and field overrides fail
closed pending explicit readiness support rather than silently ignoring their semantics.

## Validation

Synthetic tests cover undeployed Firestore/Storage rules, propagation, HTTP/identity failure,
READY/missing/building/incorrect indexes, pagination and implicit name ordering, unsupported index
policies, exact-main/checkout identity, and minimal deploy config. A real CLI subprocess uses an
isolated Git fixture, fake GitHub/Google responses and a fake Firebase executable: immutable blobs
survive local edits, stale jobs cannot invoke deploy, command scope is exact, legacy token fallback
is stripped, receipt filenames hash exact bytes, and a main change during verification leaves no
new receipt. Event tests reject failed/fork/non-main/non-push/wrong-SHA workflow runs. Caller example
tests preserve the shared lock and verification-before-publication order. No live cloud request,
Firebase write, signed upload or consumer activation is part of these tests.

Graph tools returned Transport closed for status/coverage after earlier worktree installation
attempts reported existing configuration ownership conflicts. New source and all relevant config
were inspected directly; no current graph completeness is claimed.

After integration with merged PRs235/237: frozen install, lint, typecheck, all1,318 tests,
compilation, PM index and inbox validation passed. The19 focused Firebase tests include
executable CLI scenarios. actionlint1.7.12 validated both inert caller workflows.
Independent review is recorded below.

## Independent review

Initial review at536cc00d06dc531a872b8196db1960917158d209 completed in6 minutes at high risk,
with three substantive findings. One author response addresses all three:

- R1: backend deployment now depends on the existing release-preflight workflow and checks out
  its SHA. Both manual tests and the eventual deploy execute SHA-equality bindings, so a passing
  test run cannot be substituted for merged-PR provenance or for a different source.
- R2: match both expected/live indexes only under supported Native Standard semantics. Read
  database identity/mode/edition, normalize omitted or explicit ANY_API/SPARSE_ALL/false defaults,
  and reject incompatible or unknown live options. Database metadata read permission is documented.
- R3: replace always() with !cancelled() and require successful source preflight. The executable
  caller-predicate test proves explicit cancellation and failed provenance cannot reach deployment.

Eleven new regressions failed against the initially reviewed implementation. The fix suite now
also includes unknown live options, source-bind shell execution, and explicit default normalization.
Expected/live default behavior follows official firebase-tools15.29.0 api.ts; omitted database
edition defaults to STANDARD there. There is no disagreement. All31 focused tests and the full1,330-test suite pass, as do lint, typecheck, compilation,
PM index, inbox validation and actionlint for both examples. Main remains550311ed313df02f4231f20ed4eb8e5cb2091ebb.
Same-reviewer follow-up at deed6eaad2ec419efa98cf78adfc413cb9f659c7 cleared all three findings in approximately one minute; all 31 focused tests passed.


## Additional author finding after review

Firebase CLI 15.29.0 prefers a cached signed-in user with a refresh token over ADC:
[official requireAuth.ts](https://github.com/firebase/firebase-tools/blob/v15.29.0/src/requireAuth.ts#L123).
Its configstore 5 dependency uses the XDG configuration directory. After the follow-up had already
cleared its stated head, the author identified this credential-identity gap. The message asking
the reviewer to include it did not extend the completed review or cover the subsequent fix.

Every deploy subprocess now uses a fresh private XDG configuration directory inside its unique
plan directory. The regression failed before the change by observing the inherited cached user.
It now verifies an empty store, preserved explicit credential path, unchanged inherited login,
and a fresh empty store on retry even when a prior invocation has saved a login. The legacy
FIREBASE_TOKEN remains stripped. This uses synthetic credentials only.

All 31 focused and all 1,330 tests pass, along with lint, typecheck, compilation, PM index and
inbox validation. The package build command is `pnpm compile`; the old AGENTS command
`pnpm build` is absent and was corrected during validation. No live deployment was attempted.

Initial independent review found three substantive issues; the author fixed provenance, live index semantics and cancellation, and the first same-reviewer follow-up cleared deed6ea. The original reviewer then cleared the later credential-isolation correction and current integration at 96f5a9a in the third ordinary turn allowed by current policy. Its independent offline harness failed against pre-fix code and passed for inherited-login and retry isolation, private permissions, credential preservation and missing-credential refusal. No findings remain. One standard focused test timed out during local server setup; the offline harness covered its affected subprocess behavior, while author and hosted full suites passed. Graph limitations were covered by direct source inspection.

```morpheus-review
{
  "version": 1,
  "base": "550311ed313df02f4231f20ed4eb8e5cb2091ebb",
  "reviewed": "536cc00d06dc531a872b8196db1960917158d209",
  "covered": "96f5a9ad104b1c115f2e75deb7fe879ece7f616c",
  "authorSession": "01a08ebd-2cd3-7923-a70e-94bf73e90da3",
  "reviewerSession": "/root/review_firebase_boundary",
  "risk": "high",
  "elapsedMinutes": 6,
  "outcome": "complete",
  "summary": "Initial independent review found three substantive issues; the author fixed provenance, live index semantics and cancellation, and the first same-reviewer follow-up cleared deed6ea. The original reviewer then cleared the later credential-isolation correction and current integration at 96f5a9a in the third ordinary turn allowed by current policy. Its independent offline harness failed against pre-fix code and passed for inherited-login and retry isolation, private permissions, credential preservation and missing-credential refusal. No findings remain. One standard focused test timed out during local server setup; the offline harness covered its affected subprocess behavior, while author and hosted full suites passed. Graph limitations were covered by direct source inspection.",
  "findings": [
    {
      "id": "FB-R1",
      "severity": "substantive",
      "description": "Backend example lacked mandatory merged-PR release preflight and exact preflight source binding.",
      "paths": [
        "docs/examples/firebase-release/backend.yml",
        "tests/firebase-release.test.ts"
      ],
      "disposition": "fixed",
      "response": "Added source preflight dependency and executable equality bindings for manual tests and deployment. Same-reviewer follow-up cleared the change."
    },
    {
      "id": "FB-R2",
      "severity": "substantive",
      "description": "Index matching ignored live API, density and multikey semantics and could certify an incompatible READY index.",
      "paths": [
        "src/firebase-release/verify.ts",
        "tests/firebase-release.test.ts",
        "docs/runbooks/firebase-releases.md"
      ],
      "disposition": "fixed",
      "response": "Verify Native Standard database identity and supported index defaults; reject incompatible or unknown options. Regression tests failed before fix; same-reviewer follow-up cleared it."
    },
    {
      "id": "FB-R3",
      "severity": "substantive",
      "description": "Backend always() condition allowed deployment after explicit workflow cancellation.",
      "paths": [
        "docs/examples/firebase-release/backend.yml",
        "tests/firebase-release.test.ts"
      ],
      "disposition": "fixed",
      "response": "Use !cancelled() and successful provenance; executable predicate tests verify cancellation blocks writes. Same-reviewer follow-up cleared it."
    },
    {
      "id": "FB-R4",
      "severity": "substantive",
      "description": "Author finding after completed follow-up: Firebase CLI can prefer a cached user login over explicit deployment ADC on reused runners.",
      "paths": [
        "src/firebase-release/run.ts",
        "tests/firebase-release.test.ts",
        "docs/runbooks/firebase-releases.md"
      ],
      "disposition": "fixed",
      "response": "Each Firebase CLI invocation now uses a fresh private config store. The original reviewer independently verified inherited cached-user isolation, retry isolation, 0700 permissions, exact arguments and missing explicit credentials in its third ordinary turn; no findings remain."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "bf4eaa8f7e441ea7b90380912ad4a7f09daf902a",
      "reason": "Prior run resolved the decisions append conflict by retaining both decision records. This is an explicit unreviewed trunk integration; it does not clear the separate credential-isolation code commit."
    },
    {
      "commit": "96f5a9ad104b1c115f2e75deb7fe879ece7f616c",
      "reason": "Resolved only architecture shipped-workflow list: retained trunk removal of osv-scan and added this branch firebase-release action. Original reviewer inspected the integrated result."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_firebase_boundary",
      "commit": "deed6eaad2ec419efa98cf78adfc413cb9f659c7",
      "outcome": "cleared",
      "elapsedMinutes": 1,
      "summary": "The original reviewer cleared R1-R3 at this exact head after inspecting source and compiled output and passing all 31 focused tests. The later cached-login isolation fix was not in this head and is not covered."
    },
    {
      "reviewerSession": "/root/review_firebase_boundary",
      "commit": "96f5a9ad104b1c115f2e75deb7fe879ece7f616c",
      "base": "3c5361eee74d95e04d2b496ac7cda36148fec915",
      "scopeReason": "Late credential-isolation correction after prior clearance, discovered by a red-before-green regression outside the earlier review, plus relevant current-trunk integration; uses the remaining ordinary turn authorized by merged PR263.",
      "outcome": "cleared",
      "elapsedMinutes": 4.329433333333333,
      "summary": "Original reviewer cleared FB-R4 and relevant integration with no new findings. Offline regression reproduced cached login at deed6ea and passed final compiled code. Standard focused run:30 passes and one local-server setup timeout; offline harness covered affected behavior. No cloud operations. Runner duration259766ms includes the whole turn; reviewer clock interval225s is narrower."
    }
  ]
}
```

## September 22 integration and validation

Merged current main a124cdce1a1ae5b8bade40ceea0f762c0969e953 into the preserved branch, producing 0c092bdc01a5e93f9ada5fa22eb00a9364bd6241 without conflict resolution. The earlier hand-resolved merge bf4eaa8 is recorded above; the original review SHA chain is unchanged. Frozen install, typecheck, all 1,393 tests, compile, PM index, lint and inbox validation passed. The current three-turn contract still ends a review when its follow-up clears; it does not automatically authorize another turn for later code. Request one bounded targeted review of cached-login isolation, its regressions and relevant integrations. Keep agent-reviewed withheld and auto-merge disabled; no consumer deployment or activation.

After PR261 merged, integrated fb459bcd2d8301eb18ae7f79215d0b984f175b49 without conflicts as 4902a68112010f436ba772c7cb9f518abd0d2bb4. Full validation passed again: all 1,394 tests, typecheck, compile, PM index, lint and inbox validation. Only this worklog changed afterward.

## September 28 completion

Resumed original reviewer thread `01a08eeb-2cec-7123-b977-415e47689b37` through its original parent
`01a08ebd-2cd3-7923-a70e-94bf73e90da3`; the canonical reviewer path and earlier history remain intact.
Merged PR263 permits this remaining late-correction turn; no human exception or replacement reviewer
was used. Runner turn `01a0e749-496b-7a10-a343-e105f905d3ef` reports durationMs=259766. This whole-turn
measurement is used instead of the reviewer's narrower 09:12:32–09:16:17 UTC clock interval.

All 1,480 tests and frozen install/typecheck/compile/index/lint/inbox passed before review. The
post-clearance integration of reviewed PR296 is an exact Git merge and spends no review turn.
After exact trunk merge 06dd5bd, all 1,482 tests, typecheck, compile, PM index, lint and inbox
validation passed. No implementation changed after review except the exact reviewed-trunk merge.
No cloud deployment, credentials, consumer activation or signed upload occurred; Evo PR205 remains held.
