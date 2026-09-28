# Morpheus technical-health audit — 2026-09-27

Baseline: `3c5361eee74d` (`origin/main`). Scope: all 1,129 tracked files, an exact full code graph,
direct review of every recorded graph gap, production dependencies, similarity and complexity
probes, repository-native validation, and current-main hosted checks.

## Executive summary

Morpheus is healthy: the production dependency audit is clean, current-main CI and scheduled
maintenance are green, and all 1,449 tests pass. Maintenance risk remains concentrated in a few
large orchestration functions. The audit branch retains last week's verified removal of two dead
source barrels and their generated output; no additional deletion or dependency change met the
same confidence threshold this week. No separate remediation draft is justified.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | CLI and scaffold orchestration remains concentrated | A direct ESLint complexity probe found 20 functions above 20, led by `doctor` 77, `scaffold` 69, `webAddConsumerAuth` 53, `webInit`/`scaffoldWeb` 46, credentials 43, and `checkPr` 39. Graph traces confirm these functions coordinate many stateful operations. | Certain for the metrics; high for the coupling | Medium: local changes can cross idempotency, preservation, and governance contracts | Split only when a tested transactional boundary is clear; no audit-day extraction. |
| 2 | Production duplication remains low | `jscpd` found 14 clones covering 149 of 32,644 lines (0.46%), concentrated in small workflow and scaffold pairs. | Certain for configured sources | Low | Reassess only when another consumer makes a shared abstraction cheaper than the duplicated code. |
| 3 | Dead-code tools report public and generated surfaces as candidates | Knip candidates resolve to package exports, workflow entry points, or committed build output; direct reference and export checks found no new safe deletion. | High | Low: deleting by tool output alone would break supported entry points | Keep direct-reference verification as the deletion gate. |
| 4 | Two obsolete barrels and generated siblings remain safely removed on this audit branch | `src/review/index.ts`, `src/voice/index.ts`, and six `dist/` siblings have no consumer; compile and the full suite pass without them. | Certain | Low: fewer public-looking dead surfaces | Included in this audit PR. |

## Dependencies, tests, and operations

- `pnpm audit --prod` reports zero vulnerabilities.
- Lint, typecheck, compile, 54 files/1,449 tests, PM validation/index, team validation, and
  `git diff --check` pass.
- Exact-head [CI](https://github.com/cpheinrich/morpheus/actions/runs/36348869901) and current
  scheduled maintenance are green; the latest Security run is green but predates this baseline.
- No tracked cache, backup, `.DS_Store`, or Python bytecode artifact was found.

## Method and limits

The exact checkout was fully indexed. The graph's small parse-recovery ranges in the generated
consumer-auth template and a Vitest generic import were read directly. Generated output,
dependencies, configuration, and assets were inspected outside the graph. A clean graph result is
best-effort evidence, not proof of absence.
