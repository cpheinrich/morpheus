# Morpheus technical-health audit — 2026-10-05

> **Urgent dependency finding:** `origin/main` resolves `brace-expansion@5.0.9` through the direct
> `minimatch` dependency, producing two high-severity and one moderate production advisory. Draft
> [#320](https://github.com/cpheinrich/morpheus/pull/320) pins the smallest fully patched release
> admitted by the parent range and makes the production audit clean.

Baseline: `44ef974a7d7f` (`origin/main`). Scope: 1,265 tracked files, production and development
dependencies, dead-code and tracked-artifact inventories, configured source similarity,
complexity, repository-native validation, governance records, and current-head hosted runs.

## Executive summary

Morpheus remains operationally healthy: exact-head CI and scheduled maintenance are green and all
1,624 tests pass. The material regression since the last audit is the production dependency
exposure isolated in draft #320. A separate automated security PR, #315, owns the remaining
development-only gRPC findings. Structural risk is still concentrated in large stateful CLI,
scaffold, review, and GitHub-manager orchestration. The audit branch retains its previously
verified removal of two dead source barrels and six generated siblings; no additional safe
deletion was established this week.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | Production brace expansion is vulnerable | `pnpm audit --prod` reports GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p, and GHSA-q2hr-2g5m-vwhr through `minimatch > brace-expansion@5.0.9`. Draft #320 resolves 5.0.12 and reports zero production findings. | Certain | High availability risk if attacker-controlled patterns reach expansion | Review draft #320; keep it isolated from the audit report PR. |
| 2 | Stateful orchestration remains concentrated | ESLint reports 27 functions above complexity 20, led by `doctor` 77, `scaffold` 69, `routePullRequest` 57, `webAddConsumerAuth` 53, web scaffolding 46, credentials 43, QA serving 42, review validation 40, and `checkPr` 39. | Certain for metric; high for interpretation | Medium: changes can cross idempotency, preservation, and governance contracts | Split only behind tested transactional boundaries. |
| 3 | Workflow duplication increased but source duplication stays low | `jscpd` found 49 clones covering 607 of 44,490 configured lines (1.36%); TypeScript is 0.46% and YAML 10.10%. The YAML concentration is repeated workflow policy, not a safe audit-day abstraction. | Certain for configured scope | Low-medium policy drift risk | Reassess only where a reusable workflow can preserve distinct triggers and permissions. |
| 4 | Dead-code and artifact scans found no new safe deletion | Knip reports no unused files or dependencies in its configured graph. No tracked cache, backup, bytecode, or macOS metadata artifact exists. | High | Low | Keep direct reference checks as the deletion gate. |
| 5 | Prior dead barrels remain safely removed | `src/review/index.ts`, `src/voice/index.ts`, and six committed `dist/` siblings have no consumer and the complete suite passes without them. | Certain | Low | Included in this audit PR. |

## Validation and operations

- Typecheck, compile, PM validation/index, team validation, 59 files/1,624 tests, and
  `git diff --check` pass.
- The production audit fails only for the three findings isolated in draft #320.
- Exact-head [CI](https://github.com/cpheinrich/morpheus/actions/runs/37263736681) and the latest
  [schedule](https://github.com/cpheinrich/morpheus/actions/runs/37285783134) are green.

## Method and limits

The codebase-memory repair could not replace active watcher/indexer sessions, and its MCP
transport then closed. This run therefore used repository-native analyzers and direct source
inspection rather than claiming graph completeness. Similarity percentages apply only to the
configured source, script, action, and workflow scope; generated output and dependencies were
audited separately.
