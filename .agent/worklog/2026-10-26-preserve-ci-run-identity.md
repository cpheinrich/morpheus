---
roadmap: MO-26-10-26-12.02.38
tags: [engineering, devops]
---

# Preserve duplicate required CI checks

Issue #492: a failed CI conventions job was silently replaced by a successful
metadata conventions job on the same head. The actual failed job121087621483 and
its successful rerun121088495572 both belong to suite108866535707. The separate
metadata job121088242267 belongs to suite108867083283. Read-only GitHub API
verification confirmed these identities and timestamps on2026-10-26.

The reducer now retains workflow/suite identity, permits supersession only within a workflow (or external suite),
and refuses missing identity. Required/optional scope and head-change/run-census
behavior are unchanged. This is a correction to an existing domain-specific
reducer; no generic module or new package is needed.

Graph: Tier2 intended. Installer confirmed this checkout indexed at HEAD, but
search_graph and check_index_coverage returned Transport closed. Direct source
and test reads cover src/wait-ci/{checks,wait,digest,logs}.ts, the CLI wrapper and
tests/wait-ci; no graph-completeness claim is made.

## Validation

Seven new/updated assertions failed before the fix, including both default and
required-only waits returning exit0 instead of1. The retained red log is local
operational evidence. Final validation and independent review follow below.

A live GraphQL probe exposed older failed runs even on the already merged PR489.
Using suite alone would keep superseded runs forever, so Actions jobs key on the
stable workflow ID; external checks use suite ID. The same workflow display name
with a different workflow ID remains distinct. The actual GraphQL schema accepts
these fields. Raw provider evidence is retained in local/issue-triage.

- Frozen install passed.
- Final focused suite: `pnpm exec vitest run tests/wait-ci`:105/105 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, diff whitespace checks passed.
- Full `pnpm test` ran once as this automation requests:3295 passed,6 failed because
  actionlint was not installed. Installed the publisher's Darwin ARM64 actionlint1.7.12
  in ignored operational tools, verifying SHA256
  aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f.
  Reran only `tests/workflow-expressions.test.ts`:7/7 passed. No full-suite repeat.
- Live read-only GraphQL query on PR489 accepts the new fields and retains both
  CI and Review metadata workflow identities. GitHub docs: [checks](https://docs.github.com/en/graphql/reference/checks),
  [workflows](https://docs.github.com/en/graphql/reference/actions).
- The existing all-checks workflow census is deliberately unchanged. This change
  corrects duplicate-check reduction and failed-job diagnostics, not release policy.
