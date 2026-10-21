# Morpheus technical-health audit — 2026-10-19

Baseline: `e72e58ee9a3a` (`origin/main`). Scope: 1,673 tracked files, production and
development dependencies, dead-code and tracked-artifact inventories, code-language similarity,
TypeScript complexity, repository-native validation, governance, and hosted runs.

## Executive summary

Morpheus's exact-head schedules and the required checks that admitted current main are green. The
one production dependency advisory remains the abandoned frontmatter chain. Existing draft
[#376](https://github.com/cpheinrich/morpheus/pull/376) is the correct isolated remediation and
was refreshed onto current main; that refresh caught and fixed two newer parser imports that still
named the removed package. No additional source, asset, dependency, or configuration deletion met
the direct-consumer evidence bar, so this audit PR contains the report and governance records only.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | Production install graph still inherits one unpatched advisory | `pnpm audit --prod` reports GHSA-hp3w-g68c-fv3c through `gray-matter > js-yaml@3 > argparse > sprintf-js`. Runtime inspection shows `gray-matter` loads the parser entry point while the vulnerable `argparse > sprintf-js` path is imported only by the `js-yaml` CLI, so no parser runtime path is demonstrated. Refreshed draft #376 replaces the install chain and audits clean. | Certain for the installed advisory and observed imports | Supply-chain hygiene risk; no demonstrated remotely triggerable parser availability risk | Review #376; keep it draft and separate from the audit. |
| 2 | Stateful orchestration is increasingly concentrated | ESLint with complexity 20 reports 53 functions over the threshold, led by `doctor` 78, `routePullRequest` 78, `scaffold` 69, QA dispatch 63, preview-config parsing 61, and review validation 55. | Certain for the metric; high for interpretation | Medium regression risk at idempotency and governance seams | Split only behind behavior-pinning tests when those seams next change. |
| 3 | Code duplication is low overall but higher in generated/runtime JavaScript | Code-language `jscpd` scope reports 115 clones and 1,042 duplicated lines across 81,962 lines (1.27%): TypeScript 1.22%, JavaScript 2.69%, Python 0.25%. | Certain for measured scope | Low-medium drift risk | Consolidate behavior only where generated-output and workflow semantics remain explicit. |
| 4 | No safe dead-code, asset, dependency, or obsolete-file deletion was established | Dependency-only Knip's apparent Firebase and `@types/js-yaml` candidates are exercised by CLI/rules tests or typed test imports. Broader output is dominated by committed build output and standalone entry points. No tracked cache, bytecode, backup, or macOS metadata was found. | High for dependency/artifact scope; limited for every entry point | Low | Keep direct consumer checks before deletion; do not infer graph completeness. |
| 5 | Current-main hosted health is green | Current-head scheduled runs are green; the required checks on [#418](https://github.com/cpheinrich/morpheus/pull/418) that produced current main completed successfully. | Certain | Low immediate CI risk | Keep monitoring failures as incidents rather than treating green schedules as exhaustive proof. |

## Validation and limits

- The main audit is records-only. Typecheck, compile, PM index/validation, team validation, and
  diff checks are recorded in the worklog.
- Draft #376 separately passes a clean production audit, typecheck, 290 focused tests, and compile
  after integrating current main.
- Codebase-memory could not establish an exact usable index and its MCP transport closed.
  Evidence therefore comes from direct analyzers and source inspection; no graph-completeness
  claim is made.
