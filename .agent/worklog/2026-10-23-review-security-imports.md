# Review attested Security import candidates

Chris approved a Morpheus-only review service using the existing Manager App and Claude token.
The normal Manager bot-lane skip and protected-path self-review restrictions remain intact. The
new reviewer receives contents read; its separate deterministic apply job receives issues write
to comment and label, but no contents write or merge route. Security's reconciler retains merge
authority and requires its own exact-head candidate attestation, the Manager App comment, holds,
required checks and branch protection.

The first CI proposal added a prerequisite proof job and `labeled` event to the global CI
workflow. Automatic approval review rejected that action because it could block unrelated PRs;
the rejected edit did not execute. The implementation instead uses the existing review-metadata
workflow's `labeled` event and leaves ordinary CI untouched. The reused PR checker
accepts its proof input only in Morpheus, while the isolated proof job checks both App identities,
head, repository opt-in and changed-file scope.

Focused tests: `pnpm exec vitest run tests/security-import-review.test.ts tests/check.test.ts
tests/cli-check.test.ts tests/workflows.test.ts` — 295 passed. After independent review findings,
`pnpm exec vitest run tests/security-import-review.test.ts tests/workflows.test.ts tests/check-pr.test.ts`
passed 167 tests. The first re-run found two old workflow assertions that expected only one metadata
job and the old exact condition; both were updated for the new proof prerequisite and explicit
`always()` that keeps unrelated metadata checks running. `pnpm compile` and
`pnpm morpheus pm index` passed. `pnpm typecheck` fails only on the existing main-branch import
`gray-matter` in `tests/agentic-cto-skill.test.ts`; the separately reviewed #461 repairs it but
is still an unmerged draft awaiting authorization. Full suite and independent review await a
green base and complete draft packet. Independent review of head `49b48a52` blocked clearance:
forbidden first path components could pass; the model checkout could differ from the live attested
head; the extra conventions workflow duplicated the required status; and a transient hold never
retried. The current repair checks each path segment, rejects a stale reviewer checkout, uses the
existing metadata workflow, and allows one bounded same-head hold retry. Re-review is pending.

The second review found that an unrestricted model shell could run candidate code with the
long-lived Claude token in its environment. The review step now uses pinned Claude CLI restricted
and safe modes with only Read, Glob and Grep tools; it has no GitHub token, no Bash, no MCP, and
does not write the decision itself. A deterministic step captures the exact-head diff, verified
test-merge check results, and official OSV/npm provenance in a dedicated credential-free packet
directory before the model receives its token; it extracts strict JSON afterward. A missing,
pending, failing or stale prerequisite check prevents the model review from starting. The model never
executes target tests; CI owns that proof. Focused tests (295), syntax check, and diff check passed
after this fix. The reviewer also identified plural/related credential and trading path names;
both Security and Manager validators now exclude those path forms and test them.

The final reviewer response conditionally cleared head `3b78af48` if the packet directory,
verified test-merge parent and check gate, and OSV/npm evidence were implemented within the
named workflow/script/test/runbook files. The focused security review/workflow tests passed 168
cases after these changes; `node --check scripts/security-import-review.mjs` and `git diff --check`
passed. A direct npm registry request for the scoped `@11ty/gray-matter@3.0.0` endpoint returned
the exact package/version and a distribution integrity value. No live private caller was run.
