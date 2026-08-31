# Morpheus technical-health audit — 2026-08-31

Baseline: `3b8a44c83554` (`origin/main`). Scope: all 813 tracked files, with an exact
checkout-specific code graph plus direct inspection of reported parse gaps, configuration, tests,
dependencies, and live GitHub Actions state. This refresh reuses audit PR #176; the operational
remediation remains isolated in draft PR #177.

## Executive summary

Morpheus's product controls remain healthy: typecheck, lint, compile, all 1,017 audit-branch tests,
project-management validation, and the production dependency audit passed. The urgent finding is
unchanged: the main-branch scheduled workflow continues to fail before any job starts. Draft PR
[#177](https://github.com/cpheinrich/morpheus/pull/177) contains the bounded permission repair and
immutable action pins, and its branch-level hosted dispatch has succeeded. No additional source or
asset deletion was both clearly safe and useful this week, so the audit branch retains the prior
low-risk lint-contract repair without manufacturing churn.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | The main-branch schedule still fails before job creation | Main run [33396582551](https://github.com/cpheinrich/morpheus/actions/runs/33396582551) concluded `startup_failure` with no jobs, continuing the observed run history. Draft-branch dispatch [33233648707](https://github.com/cpheinrich/morpheus/actions/runs/33233648707) succeeded with the repair. | Certain | High: the scheduled control is absent on the protected default branch | Review draft PR [#177](https://github.com/cpheinrich/morpheus/pull/177); keep it draft until the workflow-policy change is accepted. |
| 2 | CLI parsing and dispatch are concentrated in one module | The graph reports `main` at cyclomatic complexity 86/cognitive 164 and `parseArgs` at 50/148 in `src/cli/index.ts`; `doctor` and `init` also contain broad dispatch surfaces. | High | Medium: CLI grammar or error-text changes have a large regression surface | No remediation PR was opened: a safe split requires a stable invocation/error contract and acceptance seam first; a mechanical extraction could change the public CLI. |
| 3 | Small helper duplication remains local rather than systemic | The graph found seven similarity relationships, mainly tiny file-I/O and generated-index helpers such as `put` and `readIfExists`; direct inspection found no duplicated business rule. | High | Low: modest maintenance cost, with locality currently aiding comprehension | Keep as inventory. Extract only when a shared behavior contract appears in a second change. |

## Dead code, dependencies, assets, tests, and drift

- The graph's ten uncalled candidates were exports, framework callbacks, template entry points, or
  deliberate test seams on direct inspection; none justified deletion.
- `pnpm audit --prod` reported zero vulnerabilities across 13 production dependencies.
- No obsolete tracked asset or configuration was found at high confidence. Committed `dist/`
  output remains an intentional repository contract.
- `pnpm lint`, `pnpm typecheck`, `pnpm compile`, 37 test files/1,017 tests, PM validation/index,
  inbox/team validation, and `git diff --check` passed on the refreshed audit branch.

## Method and limits

The checkout graph was indexed at 2026-08-31T16:06:13Z. Its only partial parse coverage was in
`src/web/consumer-auth/templates-tests.ts`; every reported range was read directly before making
claims. A clean graph-coverage result means no recorded indexing gap, not proof that no future
defect exists. Low-risk repairs belong in #176; the only active disruptive remediation remains
linked draft #177.
