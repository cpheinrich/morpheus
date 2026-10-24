---
date: 2026-10-23
agent: codex
roadmap: MO-26-10-23-00.15.26
outcome: research
summary: "Implement explicit Paperclip job linkage and prepare private authentication qualification"
---

Chris approved phase 2 with explicit one-to-many Morpheus/Paperclip linkage. This isolated
task checkout was claimed with runner-issued agent path `/root/phase2_bridge`, avoiding the
parent experiment's task association. The initial claim also reconciled three previously merged
roadmap items. Before the parent's packet approval, the author made no implementation push,
extra native model invocation, new account enrollment or controller mutation.

The source adds a narrow operator bridge. It reuses PM parsing/branch IDs and commits exact
intent before submission. Stable operation IDs, a common-Git-directory attempt journal,
upstream issue-create idempotency and exact issue GET readback protect the external boundary.
Unknown outcomes never repost; an observed exact issue ID can be linked. Status stays live in
Paperclip. Committed evidence receipts return through Git without editing/closing the roadmap.
Commander 15.0.0 was checked in npm (modified 2026-09-02, no dependencies); built-in parseArgs
is sufficient for the fixed commands. No dependency was added.

Pinned installed 2026.1012.0 source confirms authenticated/private loopback deployment,
native owner bootstrap/acceptance, named board keys and task_bridge/skill_test scopes. The
existing local-trusted controller grants implicit admin without a bearer, so a loopback tunnel
alone is insufficient isolation. Standard run JWTs do not establish own-task-only authority.
The reversible operator helper stages private config/plist snapshots and a private auth secret,
preserves the database/company/agents and port 3100, and trusts Air's 33100 origin. Optional
native bootstrap creates a generated local operator and stores credentials privately before
disabling signup. Runtime migration and exact unauthenticated/board/worker denial probes are
owned by the parent; source or mocked HTTP success is not runtime acceptance.

The parent's initial live migration found two upstream lifecycle details: launchd can retain
the label briefly after bootout, and local-trusted startup seeds a synthetic local-board admin.
The helper now has one bounded delayed bootstrap retry and a separate native `claim-migrated`
flow. The latter inspects the upstream one-time challenge, issued only for a sole placeholder
admin, then uses the authenticated native claim instead of forcing a first-admin invite.
The parent had observed only an existing-admin refusal before any signup; that journal remains
preserved. Mocked native HTTP/service flows exercise both owner routes without live mutation.

Live qualification then exposed two origin boundaries absent from the first mocks. The CLI
rewrites a loopback base URL to listen port 3100, so Air's origin 33100 also needs the supported
BETTER_AUTH_TRUSTED_ORIGINS environment setting. Better Auth and the board API have distinct
guards: signup with trusted 33100 works, while board mutations sent to Host 3100 require matching
Origin 3100. The helper and its HTTP fixtures now check those exact routes/origins. A supported
explicit resume preserves the existing private identity after an inspected pre-handler rejection;
it never invents a new signup identity or automatically retries uncertain later effects. The
parent independently reported native ownership/key responses 200/201 after correcting the
origins. Full caller probes and consumer protected delivery remain separate acceptance work.

Initial focused tests found only macOS `/var` versus `/private/var` canonical-path expectation
drift in the staging fixture. The fixture now compares real paths. More importantly, source
validation deliberately uses immutable Git blobs during result reconciliation: comparing the
current roadmap bytes to the initial source would incorrectly reject a normal later move to
review. Prepared inputs still require committed current bytes; result evidence is separately
committed and hashed.

Validation commands and final results are recorded below before the implementation handoff.
The broader roadmap acceptance (real protected delivery per host, repeatable setup, isolation,
interruption and prospective metrics) remains unqualified by these synthetic tests. This source
packet must not mark those capabilities complete or the item shipped.

Validation completed:

- `pnpm exec vitest run tests/paperclip-bridge.test.ts`: 28 passed, latest run 2026-10-24
  03:07:00 UTC, 6.80 s. This covers only the new operator boundary; no pilot/native executor
  source changed. Fixtures use temporary Git repositories and synthetic HTTP/service calls.
- `pnpm typecheck`: passed. Tests import the bridge so its TypeScript is included.
- `pnpm exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop scripts/paperclip-bridge/cli.ts`: passed,
  explicitly checking the standalone CLI outside the repository tsconfig include list.
- `pnpm compile` and `pnpm morpheus pm index`: passed; committed dist and generated indexes
  were unchanged. `git diff --check`: passed.
- No local full suite: the change touches no shared-core path requiring it; CI owns that
  broader run. No claim of qualified simulator, native provider cancellation, restart adoption,
  account failover or consumer protected delivery is made.

Graph evidence was Tier 2 on primary generation 2026-10-24T02:23:58Z: parseArtifact outbound
trace reaches parseDir; exact snippet and coverage for src/pm/parse.ts, schema.ts, id.ts and
git-env.ts had metadata_match/no_recorded_issue. The isolated checkout bootstrap indexed its
exact HEAD. A later new-file coverage call failed with Transport closed, so new bridge/helper
files rely on exact source inspection and synthetic execution rather than a completeness claim.
Installed upstream source was read directly; it is outside this project's graph.

Two committed read-only snapshot job specifications and one explicit acceptance file are
included for parent-run one-to-many validation. Runtime artifacts stay outside this checkout;
only independently inspected, sanitized artifacts/receipts may return on this branch. The
author had not submitted either job or read the parent's temporarily protected owner token
when preparing the initial source packet.

The accountable parent approved a routine increment split before PR creation: this item's
acceptance is the authenticated bridge and two real read-only snapshot jobs. Newly filed
MO-26-10-23-19.45.05 retains all original consumer per-host protected delivery, repeatable host
setup, actual worker authority, interruption, simulator/CI, model-attribution and prospective
measurement requirements. No additional subscription/account enrollment or remote provider
inference was authorized. The source PR stays draft pending runtime/evidence and independent
review; the split does not waive or report those broader capabilities as delivered.

Both explicit intents were prepared from source 6ca59e8fedd3ee2552adfd3a365946049b3a4aef
before either was committed, then committed together in 15d874c5. The parent's live scope
probes are copied, after checking for credential-bearing content, into the sibling evidence
directory: anonymous agents 401; scoped peer read, runtime mutation, process-agent creation,
secrets and run telemetry 403; wrong-project/wrong-assignee creates 403 with explicit scope
errors. A paused assignee initially returned 409 before authorization, so only the corrected
known-real-target/invokable positive controls count as scope evidence. Documentation and a
focused HTTP-409 no-repost test preserve that distinction.

After explicit parent authorization, the author loaded only the lineage scoped key in a trusted
subprocess, protected both private key files mode 000 before POST, and submitted inspect-lineage
once. Exact GET readback linked issue 9ec1fa46-eb0f-4704-8382-615ad6a11b46 to operation
morpheus-c993d815c1b765b05e4d3ed4e99fc638346d9c25fb0f2153597f541d6757c5da. No owner key
was read or changed. No manual wakeup was sent. The tests job remains unsubmitted pending its
separate authorization and bounded monitor; runtime artifacts are not accepted from job status.

The parent's first lineage run 121f768d-a45b-480f-a5d1-e9a2057452ef terminated successfully.
The parent checked the actual artifact identity/schema, cited source symbols, and unchanged
whole source-file/symlink inventories, then protected that workspace. Under a separate exact
authorization, the author temporarily opened only the tests scoped key for loading, returned
it to mode 000 before POST, and submitted inspect-tests once. Exact GET readback linked issue
ef2c23bf-0d44-4591-9405-afd4e4398ff0 to its committed operation. The owner vault and lineage
key were untouched, and no manual wakeup was sent. Final artifact verification and reconciliation
are still pending.

After context compaction, graph service access recovered. The exact worktree generation is
2026-10-24T02:25:41Z; coverage reports the four new bridge/helper/test files as not_tracked,
with no recorded issues. These new paths continue to rely on direct source reads and execution;
no graph completeness claim is made. The executor bridge reports no Claude run for this author
session and automatic routing remains Codex with 66% allowance remaining.

Both real native snapshot runs succeeded with verified termination. The parent inspected
all four actual observations against source 6ca59e8fedd3ee2552adfd3a365946049b3a4aef and
proved unchanged whole source-file/symlink inventories. The author copied only the planned
artifact from each temporarily opened workspace and immediately restored mode 000. Sanitized
controller proof preserves exact run IDs, native thread IDs, requested versus unknown serving
model/effort, CLI 0.163.0 and raw/cache/output provider token telemetry. Artifact and receipt
bytes were committed in 69f7c483 before each one-time reconciliation exact-read upstream done.
Both private scoped keys returned to mode 000 before those calls; the owner vault was untouched.
The parent received clearance before starting any further benchmark models.

The tests inspection identified two concrete missing regression cases, parentIssueId and
parentIssueIds in assertIsolation. Both now assert the exact scope error and zero POSTs;
the implementation already rejected those inputs, so this was test learning, not a runtime
authorization defect. Author packet validation also exposed an acceptance-path mismatch:
Morpheus review resolves a bare roadmap value beneath qa/acceptance/, whereas the initial
bridge treated it as repo-root. The bridge now imports existing acceptancePath, with a
bare-filename/explicit-path regression; the active item names a canonical qa acceptance file.
The original snapshot source/acceptance references and artifact bytes remain immutable.
Tier 2 graph discovery of acceptancePath, inbound trace, exact snippet and coverage found
metadata_match/no_recorded_issue in src/review/prompt.ts and delivery.ts at generation
2026-10-24T02:25:41Z. This reuse changes no shared-core source.

The scope is authenticated operator linkage and real read-only snapshot execution. Standard
worker JWT breadth, source authoring, protected consumer delivery per host, simulator/CI,
restart adoption and cross-host recovery are not qualified by these runs. The follow-up item
preserves those acceptance requirements. The fresh source review will use the parent's
isolated native v2 launcher with plugins/MCP auto-install and computer/browser access disabled;
it will receive final source/evidence, no author history, and measured invocation timing.

Independent native review found one minor exact-parent symlink escape and no substantive issues. The author reproduced the escape, fixed the containment guard and added a regression that fails before the fix; 28 focused tests, typecheck and diff checks pass. The reviewer pre-cleared this exact change, so its condition is satisfied without another model turn. Broader consumer and worker capabilities remain unqualified.

The fresh native reviewer independently checked both source-reference hashes, receipt equality,
evidence digests and identities. It ran no tests or live API probes. Its actual runner-issued
session was 01a16bde-0a28-7b13-8987-a2c092230ae0; measured elapsed time was 91326 ms,
above the high-risk floor and below the imposed 10-minute deadline. No follow-up inference or
API fallback was used. The original short finding ID R1 is recorded as R1-parent-escape for
the review schema; its minor severity and exact pre-clearance condition are preserved.

```morpheus-review
{
  "version": 2,
  "base": "6934c4ddc0dd401f3b6f861020466bf92d1657b0",
  "reviewed": "1dcb4abe8175a6e9eaecf614bfb069de62dc1540",
  "covered": "39735b686034f35714c5c6d7a3942d3ac59c70f2",
  "authorSession": "01a16bb8-76d9-72c0-af65-c16359c44935",
  "reviewerSession": "01a16bde-0a28-7b13-8987-a2c092230ae0",
  "risk": "high",
  "elapsedMinutes": 1.5221,
  "timing": {
    "source": "clock",
    "durationMs": 91326,
    "evidence": "Native reviewer session 01a16bde-0a28-7b13-8987-a2c092230ae0; controller monotonic measurement durationMs=91326; observed UTC start 2026-10-24T03:04:36.008811+00:00, finish 2026-10-24T03:06:07.334696+00:00. Private invocation.json and JSONL retained in /var/folders/y2/4jh9hjp56hqbrrmzpz7zzkx00000gn/T/morpheus-paperclip-independent-review-5tomvmcr."
  },
  "outcome": "complete",
  "summary": "Independent native review found one minor exact-parent symlink escape and no substantive issues. The author reproduced the escape, fixed the containment guard and added a regression that fails before the fix; 28 focused tests, typecheck and diff checks pass. The reviewer pre-cleared this exact change, so its condition is satisfied without another model turn. Broader consumer and worker capabilities remain unqualified.",
  "findings": [
    {
      "id": "R1-parent-escape",
      "severity": "minor",
      "description": "Original reviewer finding R1: savePrepared accepted directory relative path exactly .., allowing a per-roadmap directory symlink to write a new job record in the immediate repository parent. Exclusive creation prevented overwriting an existing file.",
      "paths": [
        "scripts/paperclip-bridge/bridge.ts",
        "tests/paperclip-bridge.test.ts"
      ],
      "disposition": "fixed",
      "response": "Reject exact .., nested parent paths and absolute results before record writing. A synthetic private parent directory confines the regression and asserts the outside record is absent. The regression failed against the reviewed guard, then passed after the fix.",
      "condition": {
        "paths": [
          "scripts/paperclip-bridge/bridge.ts",
          "tests/paperclip-bridge.test.ts",
          ".agent/worklog/2026-10-23-link-paperclip-jobs.md"
        ],
        "evidence": "Reviewer pre-clearance: reject the exact-parent escape and add a regression asserting rejection and absence of the outside record. Run pnpm exec vitest run tests/paperclip-bridge.test.ts, pnpm typecheck, and git diff --check, all passing. No documentation or generated-file changes are needed."
      },
      "conditionMet": "The targeted symlink regression failed before the fix (promise resolved instead of rejecting). After the guard fix, pnpm exec vitest run tests/paperclip-bridge.test.ts passed28/28 at2026-10-24T03:07:00Z in6.80s; pnpm typecheck and git diff --check passed. Only the exact reviewer-allowed bridge/test paths changed in covered commit 39735b686034f35714c5c6d7a3942d3ac59c70f2."
    }
  ]
}
```
