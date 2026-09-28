# Morpheus technical-health audit — 2026-09-28

Baseline: `e60a5b765b2c` (`origin/main`). Scope: all 1,153 tracked files, an exact full code graph,
direct review of every recorded graph gap, production dependencies, similarity and complexity
probes, repository-native validation, and current-main hosted checks.

## Executive summary

Morpheus remains healthy: the production dependency audit is clean, current-main CI and scheduled
maintenance are green, and all 1,488 tests pass. The three changes since the prior audit add
Firebase-release verification and review-governance diagnostics without introducing a safe dead
code deletion. Maintenance risk remains concentrated in large orchestration functions. The audit
branch retains the previously verified removal of two dead source barrels and their generated
siblings; no separate remediation draft is justified this week.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | CLI and scaffold orchestration remains concentrated | ESLint reports 21 functions above complexity 20, led by `doctor` 77, `scaffold` 69, `webAddConsumerAuth` 53, `webInit`/`scaffoldWeb` 46, credentials 43, `validateReviewRecord` 40, and `checkPr` 39. New Firebase release verification is 21. Graph traces confirm these coordinate stateful operations. | Certain for the metrics; high for the coupling | Medium: local changes can cross idempotency, preservation, and governance contracts | Split only when a tested transactional boundary is clear; no audit-day extraction. |
| 2 | Production duplication remains low | `jscpd` found 25 clones covering 325 of 30,490 lines (1.07%) across source, scripts, actions, and workflows; TypeScript is 0.61% and YAML 4.86%. | Certain for configured sources | Low | Reassess when a third consumer makes a shared abstraction cheaper than the duplicated workflow or scaffold code. |
| 3 | Dead-code tools still over-report public and generated surfaces | Knip candidates resolve to package exports, workflow entry points, composite-action runners, or committed build output. Direct reference and export checks found no new safe deletion. | High | Low: deleting by tool output alone would break supported entry points | Keep direct-reference verification as the deletion gate. |
| 4 | Two obsolete barrels and generated siblings remain safely removed on this branch | `src/review/index.ts`, `src/voice/index.ts`, and six `dist/` siblings have no consumer; compile and the full suite pass without them. | Certain | Low: fewer public-looking dead surfaces | Included in this audit PR. |

## Dependencies, tests, and operations

- `pnpm audit --prod` reports zero vulnerabilities.
- Lint, typecheck, compile, 55 files/1,488 tests, PM validation/index, team validation, and
  `git diff --check` pass.
- Exact-head [CI](https://github.com/cpheinrich/morpheus/actions/runs/36404276018) and current
  scheduled maintenance are green.
- No tracked cache, backup, `.DS_Store`, or Python bytecode artifact was found.

## Method and limits

The exact checkout was fully indexed. The graph's parse-recovery ranges in the generated
consumer-auth template and a Vitest generic import were read directly; changed or untracked
metadata paths were also checked in source. Generated output, dependencies, configuration, and
assets were inspected outside the graph. A clean graph result is best-effort evidence, not proof
of absence.
