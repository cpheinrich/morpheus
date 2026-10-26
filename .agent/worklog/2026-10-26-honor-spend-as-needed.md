---
tags: [engineering, devops]
---

# Campaign spend-as-needed budget policy

## Design before implementation

Chris explicitly removed internal holds for this engagement while retaining its $350 ceiling. Add an optional durable `budget.spendingPolicy`, enabled only by an audited normal `cd budget --operation spend-as-needed` transaction naming campaign, cap and human authorization reference. Default reserve admission/config250 and subscription80/90 remain unchanged. Opted-in admission compares recorded spend plus the current bounded request to its campaign cap, without subtracting old reservation maxima. Preserve every reservation/digest/status and real settlement; unknown/unbilled charges stay visible rather than being invented as zero. Status reports zero internal holds and remaining against recorded spend, not a bank/provider balance.

Use existing Zod, canonical hash and GitHubStore; no generic financial framework or new dependency is needed for this small domain-specific policy. The existing source-grant contract stays separate. Root owns policy activation, exact original mixed reservation, independent source review, CI, protected merge and runtime adoption. No live ledger/provider effect by this author.

## Implementation and actual validation

Added optional validated budget.spendingPolicy and normal audited CLI operation. The opt-in compares recorded spend plus the current bounded request with its cap, while existing IDs/digests/statuses, real settlement and configuration/epoch remain intact. Status exposes mode/cap/recorded spend/zero holds/remaining/unsettled count/overspend and explicitly denies provider-balance meaning. Policy campaign/adoption identity is protected; cap changes require a new human reference. Default configured250 and native80/90 remain unchanged. Existing source-grant schema/path remains separate.

Focused commands actually run:

- `pnpm typecheck` passed after correcting a duplicated CLI insertion that the initial typecheck caught. The failed initial typecheck is not presented as success.
- `pnpm exec vitest run tests/cd/spending-policy.test.ts tests/cd/spending-policy-cli.test.ts tests/cd/state.test.ts tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts tests/cd/repair-diagnostic-cli.test.ts`:168 passed. This covers the direct reducer/parser/invariant/CLI changes and old ordinary/source-grant/diagnostic behavior. An earlier five-file scope passed144.
- After strengthening the final new tests (nonempty preserved state, explicit boundary value, external-route fakes), `pnpm exec vitest run tests/cd/spending-policy.test.ts tests/cd/spending-policy-cli.test.ts`:19 passed. No unchanged broad suite was repeated just to get a green result.
- Final `pnpm typecheck` and `pnpm compile` passed; `pnpm morpheus pm index` refreshes task indexes. Full local suite was not run: changed CD modules are outside the shared-core list requiring one. Actual full CI remains Root's protected publication step.

Two targeted source mutants were restored after each run: counting historical maxima as holds and rejecting the exact cap boundary. Final runs both fail on actual AssertionError. The first boundary-mutant run failed on an unhandled guard Error (not falsely counted as an assertion kill); the boundary test was made explicit, then both final mutants were requalified. Logs/results are retained in ignored `local/spending-policy-validation/`, including initial failure history and final mutation JSON. No mutation remains in source.

## Operational handoff and limitations

This commit is source only. Root owns independent source review, actual CI/protected merge, human-authorized policy activation, original mixed reservation and any runtime adoption. No live policy, reservation, provider, service or native-run effect occurred. Normal PM claim created/pushed its required claim record before code.

A reviewed new CLI can activate campaign01a1572f/cap350M using the exact actual human reference, then reserve the unchanged original mixed request/ID/maximum. Its normal paid digest/transition shape remain unchanged, so the old pinned CLI's exact existing-ID replay succeeds without a new financial grant. Old Q does NOT honor the policy for future NEW IDs; autonomous new-request handling requires normal updated-runtime adoption or the updated qualified CLI for each needed reserve. No host/worker route was changed here.

No-holds mode deliberately does not promise a hard total bound on concurrent/unbilled provider charges. The cap checks recorded spend plus each bounded operation; preserve unknown expenses, monitor actual costs and notify the human if exhausted/overspent. It never invents zero settlements, account credit, a new budget increase or operational retry authority.
