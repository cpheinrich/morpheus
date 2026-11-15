---
roadmap: MO-26-11-15-01.02.23
tags: [engineering, devops, factory]
---

Implemented the source portion of #707 in the existing claimed checkout, starting at
`804617265a36976b0c5c26cd266f9543ba361d20`. The controller retains independent review,
PR/CI and deployment. No push, PR, enrollment, production change, secret rotation, private
repository operation or live model invocation was performed. The existing live results for
#708 and #710 were supplied as evidence and were not repeated.

The shared `fleet-workspace.mjs` policy/intent boundary authorizes an exact repository set,
profile/sandbox, pinned comparison commits and pinned credential manifest/companion references.
Interactive `cwd`/`repos` selection resolves clean linked checkouts and authorizes each owned
path. Explicit remote and service submissions use the same intent and service authorization.
The normalized digest uses a deterministic project ordering. Stable message IDs cannot change
intent. Related source enrollments must share workspace ownership and compatible selection/slots.

`fleet-workspace-checkout.mjs` verifies protected authority, canonical paths, writable owned
checkouts, exact revisions and scoped credential pointers. The supervisor fetches full source
and comparison ancestry, including migration of a shallow mirror. Each attempt gets isolated
repository directories. A pinned local comparison remote supports ordinary Git fetch/default
branch/merge-base probes while keeping the supervisor's upstream credentials out of the worker.
The controller remains the GitHub delivery surface. Codex workspace-write receives every
explicit writable root; Full Access remains the dedicated OS-account boundary.

Declared credentials use the normal `morpheus credentials run -- <trusted-command>` path.
The executor verifies exact manifest bytes, companion origin and commit, a clean tracked tree,
and an executable protected wrapper. It links only the declared ignored local path to that
operator-provisioned store. Extra references, changed manifests/companion revisions, path
traversal, profile widening and comparison drift refuse. Root-owned companion provisioning
also needs Git safe.directory for that exact path under the authorized account. No secret
values travel in task bindings or credential exports to the worker environment.

The existing settlement journal retains fixed fetch/checkout/invocation diagnostic codes.
Receipts include exact source/policy and selection, and interactive status retains the receipt.
Unattended reporting maps the full writable-root set. Uncertain cleanup still holds the slot
and shared workspace; the existing fresh-census reconciliation behavior remains intact.
Architecture, the operator README and task contract document the policy and qualification.
The retained Mermaid matches the early diagram shown through the worker's progress channel.
No dependency was added: this is domain-specific Fleet policy using existing Zod, Git and Node.

Validation used synthetic repositories, accounts, manifests, wrapper and provider output.
The new fixture runs the real HTTP API with a transaction double, real Git fetch/checkouts,
supervisor/executor protocol, gateway worker, guardian, trusted wrapper, continuation,
report consumer and receipt. Sudo and OS authority observations are fixtures, following the
existing operator-profile test pattern. A real host's account ACLs, Xcode build/cache and
simulator services are not proven by these tests. The README specifies the private host canary
and rollback procedure; heartbeat/quota alone never certifies host capabilities.

Commands and observed results:

- `node --test plugins/factory/tests/fleet-*.test.mjs plugins/factory/tests/unattended-worker.test.mjs plugins/factory/tests/gateway-workers.test.mjs plugins/factory/tests/mcp.test.mjs plugins/factory/tests/release.test.mjs plugins/factory/tests/install.test.mjs` — 95 passed. Scope covers Fleet control/execution, existing single-repo and legacy continuation, gateway permissions, fresh-census reconciliation, deadlines, MCP discovery and installation defaults.
- `node --test plugins/factory/tests/fleet-workspace.test.mjs plugins/factory/tests/mcp.test.mjs` — 17 passed after additional policy-selection and diagnostic tests. It includes exact service receipt diagnostics and current interactive/report consumers.
- `node --test plugins/factory/tests/fleet-workspace.test.mjs` — 9 passed on final source, including executable/clean-companion checks, mutable-wrapper ACL denial, manifest-byte integrity and the stronger mutable-config assertion.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, `node plugins/factory/scripts/check.mjs`, and `git diff --check` passed. Compile generated no additional tracked output. PM indexes are static/unchanged.
- `morpheus complexity check --base 804617265a36976b0c5c26cd266f9543ba361d20` — passes the enforced CCN limit 15. Three cognitive advisories remain: executor execute 16, executor dispatch 19, gateway bindCheckout 18. These name distinct admission/preparation responsibilities and were inspected by hand; no waiver or exclusion was added.

The first complexity pass of the initial feature found CCN errors in executor prepare (18),
route creation (16), gatewayWorker (16), and companion validation (32). Refactoring separated
checkout binding, additional-route construction, manifest parsing, pointer validation,
protected-wrapper verification and link attachment. Final CCNs are prepare 13, route creation
14, gatewayWorker 9, bindCheckout 11, and companion helpers 7/9/9/6/6/2. The original companion
body measured cognitive 34 and NLOC 43; the final six-function family measures cognitive 32
and NLOC 60, including later executable/clean-tree checks. This compares initial feature code
with final code, not trunk, and is not a claim of behavior equivalence or performance improvement.
Complete before-family NLOC data was not retained, so no invented family-wide delta is reported.

Dead ends and limitations: this fresh checkout initially had no dependencies, so the first
Node run failed module resolution. Root locked install succeeded; plugin install with
`--ignore-workspace` read the wrong overrides, then the supported
`pnpm --dir plugins/factory install --frozen-lockfile` succeeded without changing a lockfile.
The first existing runner assertion rejected the intentionally added deadline diagnostic;
it now asserts that field as part of the result. Morpheus Context MCP successfully resolved
this task checkout, opened governing records and reported README/task-contract Markdown as
uncovered; those documents were read directly. Codebase-memory had no exact-checkout index;
the supported repair did not produce a usable index, and subsequent graph search/coverage
calls failed with `Transport closed`. Exact source and bounded direct reads were used instead;
no complete graph-coverage claim is made. Complexity itself is operational on this checkout
with the explicit starting base; no missing-ancestry waiver was used for implementation.

Pending acceptance: controller inspection and independent review; normal PR and required CI;
operator-approved rollout and actual per-host/profile source/write/build/cache/credential
canaries, retained privately. No unresolved implementation choice requires a human decision.


Targeted mutation checks used `node --test --test-name-pattern <pattern>
plugins/factory/tests/fleet-workspace.test.mjs` with source restoration in a Python `finally`
block. Disabling the exact repository-set comparison failed the authorization assertion;
replacing the writable-wrapper refusal with `return` failed the execution-boundary assertion;
disabling the manifest-byte digest comparison failed the altered-manifest assertion. All
three mutations were rejected and restored; there were no survivors in this bounded sample.
The mutable-wrapper test initially intercepted its own Node fixture launch in the sudo mock;
the mock now passes that explicit Node subprocess through. Preliminary mutation runs with
that fixture failure were discarded; only post-fix assertion failures count above.

## PR #713 follow-up — review findings and trunk integration

Continued from `890578b8e9e63022d0643e223e40c9c89cc2f20f`. Fetched and merged
`origin/main` at `091d4febd633bfc2d1d2319640149dd3453a1629` in the separate merge
commit `0698ef8437e2a01e248030db4bcee093df548136`. Main included #712 as well as
#711 (`2938fc3dcc348cb92c43f5bdc8ce1a9bc3de5582`), so six files needed hand
resolution: `scripts/fleet-delegate.mjs`, `scripts/fleet-executor.mjs`,
`scripts/fleet-mcp.mjs`, `scripts/tool-contract.mjs`, `src/fleet-api.mjs`, and
`src/fleet-runner.mjs`, all under `plugins/factory/`. Kept #712 display/PR metadata
alongside workspace intents and diagnostics. Kept #711's exact UUID task/attempt,
non-signaling late census and extended that same-attempt check with the retained
workspace binding. This was a merge, not a rebase.

Resolution mapping:

- FWS-001: executor invocation preflight now checks cleanliness in every authorized
  repository after reopening the prepared workspace. Tracked and untracked edits in
  either primary or related checkout refuse with `checkout_failed` and
  `never-launched`, before an admission record exists. Continuation still keeps
  tracked edits in both checkouts and an untracked related-repository file.
- FWS-002: the controller's Git helper uses existing `gitEnv()` for both revision
  and cleanliness probes. Interactive inspection under `GIT_DIR`/`GIT_WORK_TREE`
  pointing at the app still selects the library's distinct SHA and rejects its dirty
  checkout. Executor preflight probes also use the existing Git environment convention.
- FWS-003: shipped delegation skill documents `cwd` plus `repos` for the exact enrolled
  workspace, preserving provider/fresh/background/effort/speed restrictions. This is
  prose, verified against the normal-tool implementation and distribution tests.
- Recovery regression: original legacy late census, malformed/scoped evidence and
  non-signaling live-process cases remain. A retained workspace can reconcile only
  with matching workspace evidence; missing workspace, changed profile, digest or
  repository revision refuses without writing reconciliation proof.

Read GitHub Actions run `43701538311`, job `132773573435`, with
`gh run view --repo cpheinrich/morpheus --job 132773573435 --log-failed`. Its only
failed case was the new workspace end-to-end fixture at the completed-outcome
assertion (201 passed, 1 failed). The fixture depended on an installed global
`morpheus`, while this CI job installs only the Factory plugin. A deliberately
unavailable `morpheus` executable reproduced that failure locally (10 passed,
1 failed). The fixture now invokes the real linked companion wrapper directly,
retains the unavailable-CLI canary and includes the sanitized outcome in a failed
assertion. It still exercises real API/source/executor/guardian/wrapper behavior,
but does not claim integration with the full Morpheus CLI. Core credential tests
cover that CLI separately. No production runtime fallback or dependency was added.

Compatibility boundary: the current API already preserves fixed-SHA and Git
`project`/`revision` submissions when a project has no workspace policy. Added a
regression for both forms, an unrelated policy, refusal of unauthorized workspace
intent, and refusal of missing intent after explicit opt-in. No API relaxation was
needed. README, architecture and task contract document safe opt-in order: install
compatible source, migrate all consumers to exact related revisions and related
patch/artifact handling, drain, then change enrollment; or use separate explicit
enrollments. The existing private Evo dispatch/review consumers described by the
controller are **not** migrated by this change. Do not switch their old registration
until they can submit and consume the full workspace. Product integration and live
capability proof remain follow-up of #707.

Validation on final source (local Node `v26.8.2`; required CI still runs Node 22):

- `node --test plugins/factory/tests/fleet-workspace.test.mjs` — 11 passed after
  removing the fixture's global-CLI dependency.
- `node --test plugins/factory/tests/fleet-*.test.mjs plugins/factory/tests/unattended-worker.test.mjs plugins/factory/tests/gateway-workers.test.mjs plugins/factory/tests/mcp.test.mjs plugins/factory/tests/release.test.mjs plugins/factory/tests/install.test.mjs` — 103 passed, 0 failed/skipped. Covers workspace admission/continuation/recovery, legacy sessions, deadlines, source, reporting, merged display behavior, and plugin installation/discovery.
- `pnpm exec vitest run tests/credentials.test.ts tests/factory-distribution.test.ts tests/project-skills.test.ts` — 3 files, 31 tests passed.
- `node plugins/factory/scripts/check.mjs`, `pnpm typecheck`,
  `pnpm --dir plugins/factory/src/host typecheck`, `pnpm compile`,
  `pnpm morpheus pm index`, and `git diff --check` passed. The Factory check is its
  package's source/Python syntax check; no separate Factory lint script exists.
  Compile and PM index produced no additional tracked changes. No root full suite ran.
- `morpheus complexity check --base origin/main` — enforced CCN 15 passes;
  154 changed functions checked, 524 functions in 20 measured files. Inspected the
  invocation and Git helper families. Two cognitive advisories remain:
  executor `execute` 16 and gateway `bindCheckout` 18. No exclusions or waivers added.
- Bounded mutation checks using `node --test --test-name-pattern=...` rejected all
  three mutations: primary-only cleanliness failed at `library/source.txt`, removal
  of `gitEnv()` selected the app SHA for the library, and removal of workspace
  recovery equality incorrectly reconciled a mismatched workspace. Source was
  restored in Python `finally` blocks. The first recovery mutation invocation used
  a pattern beginning with `--` as a separate argument and was rejected by Node's
  option parser; it was rerun correctly with `--test-name-pattern=...` and failed
  at the intended assertion. The option-parser failure is not counted as evidence.

Context MCP successfully searched this admitted worktree, opened the worklog,
roadmap, test-quality and Factory architecture records, and checked Markdown coverage.
One transient Tantivy-unavailable search was retried successfully. The README, plugin
skill and task contract are uncovered by that index and were read directly.
Bootstrap updated the consented local CLI to reviewed main `091d4fe`.
Codebase-memory check/repair could not establish an exact-checkout index because
its upstream installer refused the existing Codex MCP configuration ownership;
graph status/search/coverage then returned `Transport closed`. Used bounded direct
source reads instead; no graph-completeness claim. Complexity is operational.

No push, publishing, PR label, PR merge, live enrollment/allowlist mutation, private
Evo/Darwin repository edit, secret operation, model call or host deployment was
performed. Independent re-review and required CI are still the controller's next
steps; actual host/account/Xcode/cache/credential isolation qualification remains
operator follow-up. No unresolved reversible implementation choice needs input.

## Independent review

Independent Factory review verified workspace authorization, initial cleanliness, exact per-repository Git selection, receipt provenance, legacy submission compatibility, and the trust boundaries for the hand-resolved trunk merge. All four findings were fixed and independently cleared. The final test-only correction passed both real emulator tests with CLI 15.28.1 and JDK 21. Private Evo consumer migration, real host qualification and enrollment remain tracked by #707.

```morpheus-review
{
  "version": 2,
  "base": "78eacb1848bb549349c5c1c0e29eb05edd31f511",
  "reviewed": "890578b8e9e63022d0643e223e40c9c89cc2f20f",
  "covered": "a9d0ce39909c3066f75a8f4106b5642248132eb7",
  "authorSession": "01a1de81-51c4-7202-b080-efa00f648ef0",
  "reviewerSession": "01a1dea2-b6e8-7471-a421-ad2bcef9021a",
  "risk": "high",
  "elapsedMinutes": 12.05,
  "timing": {
    "source": "clock",
    "durationMs": 723000,
    "evidence": "Factory run 882036db-1c65-4787-9fd5-cbd40229fe98: invocation measured from 2026-11-15 09:55:41 UTC to 2026-11-15 10:07:44 UTC."
  },
  "outcome": "complete",
  "summary": "Independent Factory review verified workspace authorization, initial cleanliness, exact per-repository Git selection, receipt provenance, legacy submission compatibility, and the trust boundaries for the hand-resolved trunk merge. All four findings were fixed and independently cleared. The final test-only correction passed both real emulator tests with CLI 15.28.1 and JDK 21. Private Evo consumer migration, real host qualification and enrollment remain tracked by #707.",
  "contextRead": [
    "AGENTS.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "architecture.md",
    "plugins/factory/README.md",
    "plugins/factory/skills/delegate/SKILL.md",
    "plugins/factory/src/host/docs/fleet-task-contract.md",
    ".agent/worklog/2026-11-15-enroll-fleet-workspaces.md",
    "hq/product/roadmap/MO-26-11-15-01.02.23-enroll-fleet-workspaces.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/pm-workflow.md"
  ],
  "findings": [
    {
      "id": "FWS-001",
      "severity": "substantive",
      "description": "The first execution reopened the prepared workspace as a continuation, skipping the cleanliness check in related repositories.",
      "paths": [
        "plugins/factory/scripts/fleet-executor.mjs",
        "plugins/factory/src/fleet-workspace-checkout.mjs",
        "plugins/factory/tests/fleet-workspace.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Reject tracked and untracked changes in every prepared repository before first execution and retain edits on continuation. Focused regressions verify both behaviors."
    },
    {
      "id": "FWS-002",
      "severity": "substantive",
      "description": "Inherited Git repository variables let inspection select the primary revision for a distinct related checkout.",
      "paths": [
        "plugins/factory/scripts/fleet-delegate.mjs",
        "plugins/factory/tests/fleet-workspace.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Use the shared gitEnv() for revision and cleanliness probes. The regression covers distinct SHAs and dirty related source with contaminated Git state."
    },
    {
      "id": "FWS-003",
      "severity": "substantive",
      "description": "The shipped delegation skill still prohibited multi-repository Fleet runs.",
      "paths": [
        "plugins/factory/skills/delegate/SKILL.md"
      ],
      "disposition": "fixed",
      "response": "Document the exact enrolled cwd and repos selection and the remaining local-only options."
    },
    {
      "id": "FWS-004",
      "turn": 2,
      "severity": "substantive",
      "description": "The Firestore emulator integration expected the old receipt shape, failing required Factory CI after receipt source and selection were added.",
      "paths": [
        "tests/factory-fleet-firestore.test.mjs",
        "plugins/factory/src/fleet-claims.mjs"
      ],
      "disposition": "fixed",
      "response": "Assert the exact admitted source and configured selection alongside the previous receipt assertions. The emulator tests passed on the controller and again on independent review."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a1deb8-2d4e-79d0-8740-a55287e2e8e4",
      "commit": "4994f89b5867befec57921d0cc39194900d579cb",
      "base": "091d4febd633bfc2d1d2319640149dd3453a1629",
      "scopeReason": "Recheck original findings and six hand-resolved trunk integrations preserving #711 cleanup and #712 dashboard metadata. Verify CI fixture portability.",
      "handoff": {
        "reason": "Factory runs that have completed cannot accept another turn.",
        "findings": [
          "FWS-001",
          "FWS-002",
          "FWS-003"
        ]
      },
      "blockedOn": [
        "FWS-004"
      ],
      "outcome": "blocked",
      "elapsedMinutes": 4.55,
      "timing": {
        "source": "clock",
        "durationMs": 273000,
        "evidence": "Factory run ee88b9ca-7108-48e9-a899-c30453607ba4: invocation measured from 2026-11-15 10:19:34 UTC to 2026-11-15 10:24:07 UTC."
      },
      "summary": "Cleared all three original findings and the integration diff. Found an outdated Firestore fixture caught by hosted CI."
    },
    {
      "reviewerSession": "01a1debd-c328-7df1-8ad3-e2459f72620b",
      "commit": "6476760b1dd25dfe3227aeca4bd280b8bd32dbc8",
      "base": "091d4febd633bfc2d1d2319640149dd3453a1629",
      "scopeReason": "Verify the corrected exact Firestore receipt expectation and previously resolved findings.",
      "handoff": {
        "reason": "The completed predecessor Factory session cannot be continued.",
        "findings": [
          "FWS-001",
          "FWS-002",
          "FWS-003",
          "FWS-004"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 3.183333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 191000,
        "evidence": "Factory run 7b9703b4-53c6-4925-88cf-64669caa9e00: invocation measured from 2026-11-15 10:25:39 UTC to 2026-11-15 10:28:50 UTC."
      },
      "summary": "The test-only change passed both Firestore integration tests. Eleven workspace tests also passed. All findings remain resolved."
    },
    {
      "reviewerSession": "01a1dec4-5d55-77b2-8060-cb86f24c0ddd",
      "commit": "a9d0ce39909c3066f75a8f4106b5642248132eb7",
      "base": "091d4febd633bfc2d1d2319640149dd3453a1629",
      "scopeReason": "Record the supported roadmap metadata for the source PR to leave #707 open for live qualification.",
      "handoff": {
        "reason": "The preceding Factory review completed, so a fresh reviewer verified this metadata-only late correction.",
        "findings": [
          "FWS-001",
          "FWS-002",
          "FWS-003",
          "FWS-004"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 1.5166666666666666,
      "timing": {
        "source": "clock",
        "durationMs": 91000,
        "evidence": "Factory run d481ea4c-ede8-4ead-85e4-c638a75ef6f5: invocation measured from 2026-11-15 10:32:51 UTC to 2026-11-15 10:34:22 UTC."
      },
      "summary": "Verified the supported issuesToKeepOpen field, Refs #707 in the PR description and absence of any closing keywords. The source review findings remain resolved."
    }
  ]
}
```

A metadata-only follow-up confirmed the supported keep-open field. The source PR can merge while #707 tracks live acceptance.
