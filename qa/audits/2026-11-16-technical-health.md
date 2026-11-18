# Technical health audit — 2026-11-16

Exact baseline: `898406bd6873041b4edd785b7b3e8533627fee19` (`origin/main`).

## Executive summary

Current production and complete dependency graphs are clean at the root, Factory, and Factory
host. Three focused remediations changed externally from open drafts to merged while this audit was
being finalized: [#726](https://github.com/cpheinrich/morpheus/pull/726) at
2026-11-16T22:17:07Z (`0bcbc251`), [#730](https://github.com/cpheinrich/morpheus/pull/730) at
2026-11-16T22:36:20Z (`08e0ba63`), and [#728](https://github.com/cpheinrich/morpheus/pull/728)
at 2026-11-16T22:41:42Z (`898406bd`). This automation did not merge, close, or enable auto-merge on
those PRs. It integrated the resulting main commits normally and created no replacement draft.

The earlier automated vehicles #698 and #704 also closed externally without merge after the final
installed graphs became clean. There is no remaining dependency finding that warrants a separate
draft on the exact baseline.

The exact-main CI run is green. Measured production duplication is 0.45%, complexity enforcement
has no cyclomatic violation, and a 100%-confidence dead-code scan found one test-only import seam.
This main audit removes that seam and updates the three tests to patch Python's own `sys.argv`.

## Ranked findings

| Rank | Finding | Specific evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Installed dependency graphs are clean after focused remediation** | Current root, Factory, and Factory-host audits each report zero findings both with and without `--prod`. #726 fixed host Zod; #730 upgraded the direct Vitest/Vite test stack; #728 advanced root Vitest and selected patched `re2js`. | High for exact installed graphs. | Removes every known package-audit advisory from production and development installs. | Keep the three merged PRs as provenance; no replacement draft. Re-audit on lockfile changes. |
| 2 | **Structural complexity is concentrated in governance and orchestration code** | Complexity enforcement measured 677 files / 16,419 functions with zero CCN violation and 109 advisory cognitive warnings. Highest: `requirements` 40, `linkedCases` 39, `duplicateRescueBranch` 34, `locate` 33, and `block` 32. | High for measurement; medium for refactor value. | Stateful authority flows cost more to review and are regression-prone, but broad extraction can erase important distinctions. | Refactor only behind a focused acceptance case and boundary tests; no audit-week architectural rewrite. |
| 3 | **Duplication remains low** | `jscpd@5.4.3` measured 426 production files / 87,750 lines: 40 clones, 394 duplicated lines (0.45%). | Certain for measured scope. | Low current drift risk; premature helpers could couple distinct workflows. | Keep as inventory and extract only after consumers share an identical tested contract. |
| 4 | **The only high-confidence dead-code candidate was a test seam** | The initial 100%-confidence scan reported only `sys` in `validate_consumer_main.py`. Direct inspection showed production never read it; three tests patched `validator.sys.argv`. The audit removes the production import and patches built-in `sys.argv` instead. The exact-final scan covers 416 files / 18,614 symbols / 76 entry points and reports no candidate. | High for the fix; bounded for exhaustive absence. | Removes misleading production coupling without behavior change. | Keep the focused regression test; do not infer broader absence from analyzer reachability alone. |
| 5 | **Declared runtime dependencies are used in checked package boundaries** | Root production Knip reported no issue. Factory and host package-mode Knip misclassified their script entrypoints, while direct source checks found imports for every declared dependency: MCP SDK, Firebase, Firebase Admin, ws, Zod, and systeminformation. | High for declared/imported use; bounded by dynamic/public consumers. | Avoids unsafe manifest cleanup and false confidence from an entrypoint-unaware analyzer. | Recheck with package-aware entrypoints before removing a dependency. |
| 6 | **Tracked artifacts and governance are healthy** | Exact baseline has 2,956 tracked files and no tracked recovery/junk pattern. Both 63-byte closeout blobs are referenced by their closeout records; the security badge is documented and referenced. PM, team, and inbox validators pass. | High. | Low repository-noise and convention-drift risk. | No deletion. Preserve generated-index and record validation in CI. |

## Test and CI hygiene

- Actions run `43971799807` on the #728 head passed `node / check`, `factory`, `qa-browser`,
  `artifact-abi`, `pm / pm`, and `pr / conventions` immediately before main commit `898406bd`.
- Main requires `node / check`, `pm / pm`, `pr / conventions`, and `agent-review / delivery`;
  force pushes and branch deletion are disabled.
- `deleteBranchOnMerge` remains enabled.
- The main-audit cleanup passes all five focused Python tests and Python bytecode compilation.

## Coverage and limitations

Morpheus Context supplied current record discovery and cited reads. The exact codebase-memory index
was unavailable because its existing sessions could not be stopped safely; the audit did not repeat
that disruptive installation attempt. Dependency manifests/lockfiles, direct source reads, Git,
GitHub, and current analyzers provide the evidence above. Negative dead-code and unused-dependency
claims remain bounded by analyzer entrypoints, dynamic loading, generated code, and public consumers.

## Main-audit fix

- Remove the otherwise-unused production `sys` import from
  `plugins/factory/src/host/worker/validate_consumer_main.py`.
- Make the three affected tests patch Python's own `sys.argv`, retaining identical CLI behavior.

## Focused remediation state

- [#726 — Factory host Zod](https://github.com/cpheinrich/morpheus/pull/726) — merged externally
  during the audit at 2026-11-16T22:17:07Z as main commit `0bcbc251`; this automation did not merge,
  close, or enable auto-merge.
- [#730 — Factory host Vitest/Vite](https://github.com/cpheinrich/morpheus/pull/730) — created and
  merged externally during the audit at 2026-11-16T22:36:20Z as main commit `08e0ba63`.
- [#728 — root development dependencies](https://github.com/cpheinrich/morpheus/pull/728) — merged
  externally during the audit at 2026-11-16T22:41:42Z as main commit `898406bd`; this automation did
  not merge, close, or enable auto-merge.
- #698 and #704 closed externally without merge after the installed graphs became clean. No open
  separate remediation draft remains.
