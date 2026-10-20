---
roadmap: MO-26-10-19-20.04.30
---

# Per-delivery validation source-age waiver

Chris explicitly asked the resumed Evo CD campaign to submit eight consecutive
real internal TestFlight deliveries with main changes between builds, without
staging or production wait periods. Existing manual validation bypasses cadence,
but creation, attempt planning and reviewed app repair still enforce source age.
The schema requires normal production age >=24 hours, so changing configuration
would both weaken scheduled policy and alter ledger configuration identity.

Implemented an explicit `request --validation --source SHA --source-age-waiver REF`.
The intent stores approval reference/time immutably; the waiver follows that
validation lineage through reviewed repairs. Ordinary deliveries and unwaived
validation retain source age. Source evidence, full native verification, upload
identity, group membership/installability, live source regression and immutable
receipt gates remain. No generic dependency was considered necessary: this is
small domain policy using the existing CLI, schema and ledger.

Graph evidence: Tier 2, Morpheus generation 2026-10-20T03:04:37Z; exact relevant
source paths metadata-matched without recorded gaps. Read source directly for
the changed functions and tests; tests/cd/controller.test.ts has a known parse
gap at line13, covered by direct file reading and focused execution. These signals
are best effort rather than proof of graph completeness.

Validation actually run:

- `pnpm typecheck` passed.
- `pnpm exec vitest run tests/cd/state.test.ts tests/cd/request.test.ts tests/cd/store.test.ts tests/cd/controller.test.ts`: 57 passed.
- `pnpm exec vitest run tests/cd/`: all 79 passed across 7 files, including direct
  state/CLI evidence, ledger, controller, worker/provider and host dependents.
- Four deliberate mutants (ignore waiver at creation, planning or repair; allow
  authorization rewrite) each failed the state/request tests. Restored sources,
  then reran all focused CD tests and regenerated committed dist from clean sources.
- `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`: passed.

No full repository suite was run locally: shared PM/check/session/review/template
core was not changed; CI owns the full suite. No native build or TestFlight
delivery is credited by these synthetic tests. Independent review is pending.
