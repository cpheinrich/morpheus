# Bind iOS execution to durable CD intents

Roadmap: MO-26-10-18-07.11.41.

Merged approved main/design 2ac0173 into the already claimed isolated adapter branch
before implementation. Graph tools were unavailable (parent's CLI project lookup blocked
on an active pre-coordination generation); coverage is unknown. Used targeted reads of
known workflow/action/tests and the approved design, with no completeness claim.

The reusable workflow accepts and validates an exact source SHA and durable execution id,
checks out/asserts actual source, disables cancellation for CD, and writes execution.json
from actual checkout/run metadata beside actual xcresult exports. The fixed CD artifact
contract was coordinated with the Evo exporter; ordinary caller naming remains unchanged.

The action exposes reserved build number, trusted before/resource/after hooks, receipt
path/version/build outputs and optional distribution. Existing signing, unsigned archive,
profile, entitlement and signature checks remain; exported IPA identity is now checked
against the receipt's exact app/version/build too. Reserved numbers use the existing exact
explicit-number allocator and raise its legacy floor without being bumped.

Extracted upload-effects.sh so behavioral tests execute the same boundary used after IPA
verification. Hash and validate identity before the atomic claim; exit 3 never uploads or
fabricates acceptance. Publish the upload resource immediately, retain terminal diagnostic
codes, and publish accepted.json/outputs before the after hook. The always() artifact step
survives an after-hook failure. Raw responses/secrets never enter receipts. The protected
caller job and main workflow-ref guard remain the credential boundary.

Considered borrowing generic orchestration helpers: this is a small domain-specific shell
boundary using the existing asccli/Python receipt tools and the controller's ledger bridge;
no new generic library or dependency was needed. Coordinated identity/receipt contracts
with the core controller and thin Evo consumer owners. No live Apple upload, distribution,
service configuration mutation, or operational acceptance was attempted.

## Validation

- pnpm typecheck passed; pnpm compile passed.
- pnpm exec vitest run tests/upload-receipt.test.ts tests/workflows.test.ts
  tests/ios-evidence-workflow.test.ts tests/ios-change-scope.test.ts
  tests/ios-build-cache.test.ts tests/upload-configuration.test.ts: 202 tests passed.
- Python behavioral harness: 14 tests passed, included in the Vitest receipt test.
- A first focused run caught one old test assuming checkout was step 0; updated its exact
  expected identity/checkout/assertion/scope ordering, then the complete focused scope passed.
- Final same-scope run after guard/IPA identity additions: 204 tests passed in six files.
- pnpm morpheus pm index passed, indexes unchanged; bash -n and git diff --check passed.
- The sandbox denied tsx's local IPC socket for context/index commands. Used the compiled
  CLI for context refresh and an elevated pnpm index invocation; verified remote main
  2ac0173. No user prompt or secret access was needed.

Full suite is left to CI per repository policy (this PR changes no shared TypeScript core).
No Xcode archive was run: existing archive guards are retained, and fake asccli/hooks cover
the real upload boundary without consuming the campaign's native runner or uploading.
