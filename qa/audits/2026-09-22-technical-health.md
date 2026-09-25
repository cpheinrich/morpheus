# Morpheus technical-health audit — 2026-09-22

Baseline: `fb459bcd2d83` (`origin/main`). Scope: all 1,022 tracked files, an exact full code graph,
direct review of recorded graph gaps and excluded generated output, production dependencies,
repository-native validation, and exact-head hosted checks.

## Executive summary

Morpheus is healthy: the production dependency audit is clean, current-main CI and security scans
are green, and all 1,363 tests pass. The main maintenance risk is concentrated orchestration
complexity in `doctor`, scaffolding, PR checking, and context refresh. No safe standalone split was
established in this audit. Two unreferenced source barrel files and their committed `dist/` output
were removed; compilation and the full suite prove no consumer depends on them.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | Orchestration complexity is concentrated in a small set of CLI/scaffolding functions | The ESLint complexity probe found 16 production functions above 20: `doctor` 77, `scaffold` 69, `webAddConsumerAuth` 53, `webInit`/`scaffoldWeb` 46, `checkPr` 36, and context refresh 34. The exact graph confirms `scaffoldConsumerAuth` has one CLI caller and 12 callees across filesystem, dependency, rules, and config mutations. | Certain for measured complexity; high for coupling | Medium: changes cross multiple idempotency and preservation contracts | Split only along tested transactional boundaries; do not mechanically extract helpers from mutation ordering. |
| 2 | Production duplication is low and locally bounded | `jscpd` found 9 clones covering 99 of 33,371 production lines (0.30%), mainly small pairs in codebase-memory/self-install and scaffold/survey code. | Certain for configured production sources | Low: current drift surface is small | Reassess if a second consumer needs the same behavior; no extraction now. |
| 3 | Two dead barrel artifacts remained after their modules became direct imports | Direct search, package exports, and history showed no references to `src/review/index.ts` or `src/voice/index.ts`; their four committed `dist/` siblings were generated only from those barrels. | Certain | Low: obsolete public-looking surface and generated noise | Fixed in this audit PR. |

## Dependencies, tests, and operations

- `pnpm audit --prod` reports zero vulnerabilities.
- Lint, typecheck, compile, 49 files/1,363 tests, PM validation/index, team validation, and
  `git diff --check` pass.
- Exact-head [CI](https://github.com/cpheinrich/morpheus/actions/runs/35718501120) and
  [Security](https://github.com/cpheinrich/morpheus/actions/runs/35718501741) are green.
- No duplicate remediation draft was needed.

## Method and limits

The exact full graph was indexed at 2026-09-22T11:22:27Z. It recorded no skipped source files and
four small parse-recovery ranges in the generated consumer-auth test template plus one test-file
range; those ranges were read directly. `dist/`, local state, dependencies, and generated Python
cache files are deliberately outside the graph and were inspected with source/config tools. A
clean graph result remains best-effort evidence, not proof of absence.
