# Morpheus technical-health audit — 2026-08-28

Baseline: `3b8a44c83554` (`origin/main`). Scope: all 809 tracked files, with focused validation of
the TypeScript implementation, tests, package contract, and GitHub Actions. The audit PR includes
the bounded lint repair; broader workflow-control changes are isolated in draft PR #177.

## Executive summary

Morpheus's core validation is healthy: typecheck, all 1,017 tests, and the committed build output
passed at the audited baseline. The audit found one urgent operational signal and two convention
gaps. This PR repairs and enables the low-risk lint contract. The scheduled-workflow permission
repair and immutable action pins are implemented separately in draft PR
[#177](https://github.com/cpheinrich/morpheus/pull/177).

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | A scheduled workflow failed at startup | GitHub Actions run [33226989866](https://github.com/cpheinrich/morpheus/actions/runs/33226989866) on baseline `3b8a44c` concluded `startup_failure` with zero jobs; twelve recent scheduler runs had the same shape. | High | High: a scheduled control can silently stop operating | Implemented in draft PR [#177](https://github.com/cpheinrich/morpheus/pull/177), pending hosted dispatch evidence. |
| 2 | The lint contract was present but nonfunctional and uncovered | `package.json` declared `lint: eslint src`, but ESLint was absent from `devDependencies` and CI did not enable lint. | Certain | Medium: style/static-analysis regressions could land while the documented lint command was broken | Fixed in this PR: install/configure ESLint, enable it in CI, and remove the unused variable it surfaced. |
| 3 | Reusable workflows mostly referenced mutable third-party action tags | Examples included `actions/checkout@v4`, `astral-sh/setup-uv@v4`, and `actions/cache@v6`; other sensitive actions were already pinned to commit SHAs. | Certain | Medium: upstream tags can move without a repository change | Implemented and enforced in draft PR [#177](https://github.com/cpheinrich/morpheus/pull/177). |

## Healthy controls

- `pnpm typecheck` passed.
- `pnpm lint` passed after the bounded repair.
- `pnpm test` passed: 37 files, 1,017 tests.
- `pnpm compile` passed and did not change committed build output.
- The current main-branch CI and security runs inspected during the audit were green apart from the
  scheduled startup failure above.

## Method and limits

The audit inventoried tracked files and inspected repository-owned configuration, source, tests,
and live workflow state. An exact codebase-memory index was built for this checkout, but its MCP
transport closed before queries could run, so findings were verified directly against source and
command output instead. Low-risk remediation stays in this PR; the higher-blast-radius workflow
changes are linked above and remain draft.
