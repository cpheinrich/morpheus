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
roadmap items. No implementation push, provider/model call, new account enrollment, native
executor or controller mutation was performed by this author.

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

- `pnpm exec vitest run tests/paperclip-bridge.test.ts`: 23 passed, final run 2026-10-24
  02:41:52 UTC, 5.30 s. This covers only the new operator boundary; no pilot/native executor
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
author has not submitted either job or read the parent's temporarily protected owner token.
