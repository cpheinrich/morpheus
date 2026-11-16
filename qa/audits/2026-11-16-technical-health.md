# Technical health audit — 2026-11-16

Exact baseline: `0bcbc251cbfd12cc8215c922b51dda180447ebab` (`origin/main`).

## Executive summary

Current production dependency graphs are clean at the root, Factory, and Factory host. During this
audit, focused Zod remediation [#726](https://github.com/cpheinrich/morpheus/pull/726) changed
externally from an open draft to merged at 2026-11-16T22:17:07Z; main commit `0bcbc251` contains the
fix. This automation did not merge, close, or enable auto-merge on that PR and did not create a
replacement Zod draft.

Development-only graphs still need focused attention. Root has one high and three moderate
advisories; draft [#728](https://github.com/cpheinrich/morpheus/pull/728) removes the high `re2js`
and both `@vitest/mocker` findings, while [#704](https://github.com/cpheinrich/morpheus/pull/704)
owns the remaining `minimatch` advisory. Factory host's Vitest 2 toolchain has three critical, one
high, ten moderate, and one low advisory. Prior automated PR #698 closed during the audit without
merging and was incomplete against the current advisory set; a safe replacement requires a direct
major-version Vitest migration and the complete 443-test host validation boundary.

The exact-main CI run is green. Measured production duplication is 0.40%, complexity enforcement
has no cyclomatic violation, and a 100%-confidence dead-code scan found one test-only import seam.
This main audit removes that seam and updates the three tests to patch Python's own `sys.argv`.

## Ranked findings

| Rank | Finding | Specific evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Development dependency advisories need focused remediation** | Root full audit: 1 high / 3 moderate (`re2js`, two `@vitest/mocker` advisories, `minimatch`). Factory host full audit: 3 critical / 1 high / 10 moderate / 1 low, concentrated in Vitest 2, Tinypool, Vite, esbuild, and `@vitest/mocker`. All three production audits are clean. | High for installed graphs; reachability is limited to development/test tooling. | Malicious or untrusted test inputs and development servers retain denial-of-service and filesystem-exposure risk; stale tooling also raises maintenance cost. | Review draft #728 and existing #704. Replace closed #698 only through a governed direct Vitest major upgrade with the full host test boundary; do not revive its stale one-package override. |
| 2 | **Structural complexity is concentrated in governance and orchestration code** | Complexity enforcement measured 677 files / 16,393 functions with zero CCN violation and 109 advisory cognitive warnings. Highest: `requirements` 40, `linkedCases` 39, `duplicateRescueBranch` 34, `locate` 33, and `block` 32. | High for measurement; medium for refactor value. | Stateful authority flows cost more to review and are regression-prone, but broad extraction can erase important distinctions. | Refactor only behind a focused acceptance case and boundary tests; no audit-week architectural rewrite. |
| 3 | **Duplication remains low** | `jscpd@5.4.3` measured 424 production files / 87,903 lines: 33 clones, 354 duplicated lines (0.40%). | Certain for measured scope. | Low current drift risk; premature helpers could couple distinct workflows. | Keep as inventory and extract only after consumers share an identical tested contract. |
| 4 | **The only high-confidence dead-code candidate was a test seam** | The 100%-confidence scan covered 436 files / 19,153 declarations / 80 entry points and reported only `sys` in `validate_consumer_main.py`. Direct inspection showed production never read it; three tests patched `validator.sys.argv`. The audit removes the production import and patches built-in `sys.argv` instead. The repeated scan reports no candidate. | High for the fix; bounded for exhaustive absence. | Removes misleading production coupling without behavior change. | Keep the focused regression test; do not infer broader absence from analyzer reachability alone. |
| 5 | **Declared runtime dependencies are used in checked package boundaries** | Root production Knip reported no issue. Factory and host package-mode Knip misclassified their script entrypoints, while direct source checks found imports for every declared dependency: MCP SDK, Firebase, Firebase Admin, ws, Zod, and systeminformation. | High for declared/imported use; bounded by dynamic/public consumers. | Avoids unsafe manifest cleanup and false confidence from an entrypoint-unaware analyzer. | Recheck with package-aware entrypoints before removing a dependency. |
| 6 | **Tracked artifacts and governance are healthy** | Exact baseline has 2,948 tracked files and no tracked recovery/junk pattern. Both 63-byte closeout blobs are referenced by their closeout records; the security badge is documented and referenced. PM, team, and inbox validators pass. | High. | Low repository-noise and convention-drift risk. | No deletion. Preserve generated-index and record validation in CI. |

## Test and CI hygiene

- Exact-main Actions run `43966157068` passed `node / check`, `factory`, `qa-browser`,
  `artifact-abi`, and `pm / pm` before the records-only and Zod merges; the merged Zod vehicle also
  completed its governed validation before landing.
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

- [#728 — root development dependency advisories](https://github.com/cpheinrich/morpheus/pull/728)
  — open draft; removes `re2js` and both current `@vitest/mocker` findings.
- [#704 — minimatch advisory](https://github.com/cpheinrich/morpheus/pull/704) — existing open
  focused vehicle for the remaining root moderate advisory.
- [#726 — Factory host Zod](https://github.com/cpheinrich/morpheus/pull/726) — merged externally
  during the audit at 2026-11-16T22:17:07Z as main commit `0bcbc251`; this automation did not merge,
  close, or enable auto-merge.
- #698 — prior `@vitest/mocker` override — closed externally without merge during the audit. Its
  override was stale (`4.1.11` versus the current `4.1.12` fix) and did not address the direct
  Vitest 2/Tinypool/Vite/esbuild graph; a safe replacement needs the complete major-upgrade test
  boundary.
