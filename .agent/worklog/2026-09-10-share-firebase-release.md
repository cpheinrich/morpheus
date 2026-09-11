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

Independent review found three substantive issues; the author fixed provenance, live index semantics and cancellation, and the single same-reviewer follow-up cleared deed6ea. After that clearance the author discovered and regression-tested cached Firebase login isolation. That additional fix is outside completed review coverage. Review remains incomplete, agent-reviewed is withheld and auto-merge is disabled pending an explicit additional targeted-review exception. No findings were disputed; exact-source inspection supplemented unavailable graph evidence.

```morpheus-review
{
  "version": 1,
  "base": "550311ed313df02f4231f20ed4eb8e5cb2091ebb",
  "reviewed": "536cc00d06dc531a872b8196db1960917158d209",
  "covered": "deed6eaad2ec419efa98cf78adfc413cb9f659c7",
  "authorSession": "01a08ebd-2cd3-7923-a70e-94bf73e90da3",
  "reviewerSession": "/root/review_firebase_boundary",
  "risk": "high",
  "elapsedMinutes": 6,
  "outcome": "incomplete",
  "summary": "Independent review found three substantive issues; the author fixed provenance, live index semantics and cancellation, and the single same-reviewer follow-up cleared deed6ea. After that clearance the author discovered and regression-tested cached Firebase login isolation. That additional fix is outside completed review coverage. Review remains incomplete, agent-reviewed is withheld and auto-merge is disabled pending an explicit additional targeted-review exception. No findings were disputed; exact-source inspection supplemented unavailable graph evidence.",
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
      "disposition": "open",
      "response": "Implementation now isolates each child CLI configuration store. Red-before-green regression covers inherited login and retry persistence. Code is fixed, but independent verification is outstanding because the two permitted review passes are exhausted; do not claim coverage beyond deed6ea."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/review_firebase_boundary",
    "commit": "deed6eaad2ec419efa98cf78adfc413cb9f659c7",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "The original reviewer cleared R1-R3 at this exact head after inspecting source and compiled output and passing all 31 focused tests. The later cached-login isolation fix was not in this head and is not covered."
  }
}
```
