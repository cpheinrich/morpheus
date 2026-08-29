# Morpheus technical-health audit — 2026-08-28

Baseline: `3b8a44c83554` (`origin/main`). Scope: all 809 tracked files, with focused validation of
the TypeScript implementation, tests, package contract, and GitHub Actions. This is a report-only
audit; it changes no application code or automation.

## Executive summary

Morpheus's core validation is healthy: typecheck, all 1,017 tests, and the committed build output
passed at the audited baseline. The audit found one urgent operational signal and two convention
gaps. A scheduled workflow failed before starting any job, the advertised lint command cannot run
from the locked dependency set and is not exercised by CI, and most reusable workflows consume
third-party actions through mutable major-version tags. No automatic remediation is proposed.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | A scheduled workflow failed at startup | GitHub Actions run [33226989866](https://github.com/cpheinrich/morpheus/actions/runs/33226989866) on baseline `3b8a44c` concluded `startup_failure` with zero jobs. The failure occurred before repository code ran; the available run metadata did not expose a root cause. | High that the failure occurred; low on root cause | High: a scheduled control can silently stop operating | Inspect the workflow validation/startup error and add a check that catches invalid scheduled workflows before merge. |
| 2 | The lint contract is present but nonfunctional and uncovered | `package.json` declares `lint: eslint src`, but ESLint is absent from `devDependencies`; `pnpm lint` exits with `eslint: command not found`. `.github/workflows/node-ci.yml` defaults `run-lint` to false and Morpheus's caller does not enable it. | Certain | Medium: style/static-analysis regressions can land while the documented lint command is broken | Decide whether lint is a supported control. If yes, install/configure it and enable it in CI; if no, remove the misleading command. |
| 3 | Reusable workflows mostly reference mutable third-party action tags | Examples include `actions/checkout@v4`, `astral-sh/setup-uv@v4`, and `actions/cache@v6`; other sensitive actions in the repository are already pinned to commit SHAs. | Certain | Medium: upstream tags can move without a repository change | Adopt one explicit action-pinning policy, then update the reusable workflows in a bounded PR. |

## Healthy controls

- `pnpm typecheck` passed.
- `pnpm test` passed: 37 files, 1,017 tests.
- `pnpm compile` passed and did not change committed build output.
- The current main-branch CI and security runs inspected during the audit were green apart from the
  scheduled startup failure above.

## Method and limits

The audit inventoried tracked files and inspected repository-owned configuration, source, tests,
and live workflow state. An exact codebase-memory index was built for this checkout, but its MCP
transport closed before queries could run, so findings were verified directly against source and
command output instead. This pass did not perform architecture redesign, dependency upgrades,
credential changes, or automatic PR generation beyond this report.
