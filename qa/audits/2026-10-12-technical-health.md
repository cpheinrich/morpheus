# Morpheus technical-health audit — 2026-10-12

Baseline: `f063880c0002` (`origin/main`). Scope: 1,516 tracked files, production/development
dependencies, dead-code and tracked-artifact inventories, configured similarity and complexity,
repository-native validation, governance records, and exact-head hosted runs.

## Executive summary

Morpheus is broadly healthy, but exact-head CI exposed a flaky temporary-repository cleanup and
the production graph contains one unpatched moderate advisory inherited from abandoned
frontmatter dependencies. This audit PR makes the cleanup retry-safe. Draft
[#376](https://github.com/cpheinrich/morpheus/pull/376) replaces the vulnerable parser dependency
and makes `pnpm audit --prod` clean. No additional dead source or asset deletion met the direct
reference and test-evidence bar.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | CI cleanup is nondeterministic | Exact-head [CI run 38247745960](https://github.com/cpheinrich/morpheus/actions/runs/38247745960) failed with `ENOTEMPTY` while removing a temporary `.git`; the test used recursive removal without bounded retries. | Certain | Medium: healthy changes can receive a false red required check | This PR adds three retries with a 10 ms delay at the cleanup boundary. |
| 2 | Production frontmatter chain has an unpatched advisory | `pnpm audit --prod` reports GHSA-hp3w-g68c-fv3c through `gray-matter > js-yaml@3 > argparse > sprintf-js`; no patched `sprintf-js` release exists. Draft #376 moves to the maintained Eleventy fork and audits clean. | Certain | Moderate availability risk if hostile precision formats reach parsing | Review draft #376; keep it isolated until reviewed and green. |
| 3 | Stateful CLI orchestration remains concentrated | ESLint reports 42 functions above complexity 20, led by `doctor` 78, `routePullRequest` 71, `scaffold` 69, QA dispatch 63, and review validation 55. | Certain for metric; high for interpretation | Medium regression risk across idempotency and governance seams | Split only behind behavior-pinning tests. |
| 4 | Source duplication is low; workflow duplication is higher | `jscpd` found 58 clones and 833 duplicated lines across 81,564 configured lines (1.02%); YAML is 6.78%, TypeScript 0.61%. | Certain for configured scope | Low-medium policy drift risk | Consolidate only when trigger and permission semantics remain explicit. |
| 5 | No safe dead-code, dependency, or artifact deletion was established | Dependency-only Knip is clean. Broader Knip output is dominated by generated distribution and standalone entry-point false positives; no tracked cache, backup, bytecode, or macOS metadata artifact was found. | High for dependency/artifact scope; limited for all entry points | Low | Keep direct consumer checks before deletion; do not infer graph completeness. |

## Validation and limits

- The focused cleanup test passed after the retry change; typecheck, compile, PM index/validation,
  team validation, the full suite, and diff checks are recorded in the worklog.
- Exact-head schedules are green; the exact-head CI failure above is the defect fixed here.
- Codebase-memory reported an exact index, but its MCP transport closed before graph queries. The
  audit therefore used direct analyzers and source inspection and makes no graph-completeness claim.
