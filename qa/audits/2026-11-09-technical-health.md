# Technical health audit — 2026-11-09

Exact baseline: `db1c3f76c367d0f39739126e20aeda0d2b5dea42` (`origin/main`).

## Executive summary

**Urgent:** current `main` installs three high- and three moderate-severity root production
advisories, plus four high-, ten moderate-, and two low-severity advisories in Factory's production
graph. The focused draft vehicles are [#576](https://github.com/cpheinrich/morpheus/pull/576)
(Factory SDK/Zod/transitives), [#579](https://github.com/cpheinrich/morpheus/pull/579) (root
Zod), [#570](https://github.com/cpheinrich/morpheus/pull/570) (root minimatch), and
[#664](https://github.com/cpheinrich/morpheus/pull/664) (root MCP SDK). Factory's refreshed branch removes every high-severity
finding; two moderate Firebase-admin transitives remain without a safe direct-parent update.

The exact-main CI run failed one Factory quota test because its fixed seven-day reset timestamp
expired on audit day. This audit replaces that fixed timestamp with a reset relative to test start;
the focused boundary passes. No production behavior changes in the main audit branch.

The measured tree contains low duplication and no enforced cyclomatic-complexity violation. Its
advisory cognitive hotspots and graph-only zero-degree candidates are real maintenance signals,
but direct source checks do not support a safe deletion or refactor this week.

## Ranked findings

| Rank | Finding | Specific evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Production dependency advisories require focused remediation** | `pnpm audit --prod --json` reports root: 3 high / 3 moderate (`@modelcontextprotocol/sdk@1.31.0`, `zod@4.4.3`, `minimatch@10.2.6`); Factory: 4 high / 10 moderate / 2 low. Refreshed #576 resolves the Factory high findings and leaves 2 moderate Firebase-admin transitives. | High | Security and denial-of-service exposure in installed production graphs; reachability varies by transport and call path. | Review the linked drafts. Do not combine their behavior-changing dependency lines. The Firebase transitives are blocked on a safe parent resolution or a separately reviewed override. |
| 2 | **Default-branch CI is red because a fixed test timestamp expired** | Actions run `42603475253` failed `plugins/factory/tests/config.test.mjs:462`: expected the live seven-day window to read 10%, received `null` after its fixed `2026-11-09T05:11:11Z` reset passed. The audit-branch test now makes both reset boundaries relative to its start and passes in 84 ms. | Certain | Required `node / check` cannot pass on unchanged main; all current PRs inherit the failure. | Merge only after normal review/CI. This PR carries the deterministic test correction. |
| 3 | **Structural complexity is concentrated in governance and orchestration code** | Repository complexity enforcement measured 640 files and exited zero at CCN 15. It emitted 108 advisory cognitive warnings; the highest are `requirements` (40), `linkedCases` (39), `duplicateRescueBranch` (34), and `locate` (33). | High for measurement; medium for refactor value | Higher regression and review cost in stateful, authority-sensitive flows. | No audit-week extraction: there is no observed functional defect and the candidates cross distinct invariants. Refactor only with boundary tests and a focused acceptance case. |
| 4 | **Duplication remains low and mostly crosses state-machine boundaries** | `jscpd@5.4.2` measured 410 files: 30 clones / 336 duplicated lines (0.38%). | Certain for measured scope; medium that consolidation helps | Modest drift risk, but premature shared helpers could couple distinct authority transitions. | Keep as inventory; extract only when two consumers have an identical tested contract. |
| 5 | **No dead dependency or source deletion clears the evidence bar** | Production Knip found no root dependency/unlisted/unresolved issue; its only root candidate is the required external `rg` binary. In Factory it misclassified all five dependencies despite direct imports. Graph zero-degree search returned 88 `src` and four Factory functions, dominated by option-table callbacks; direct searches confirmed every named production spot-check is consumed or exported. | High for checked candidates; bounded by graph coverage | Avoids deleting public exports, generated entrypoints, or callback-driven code. | Revisit candidates only with consumer/package-entry evidence; do not infer dead code from graph degree alone. |
| 6 | **Tracked artifacts are clean** | Exact tree: 2,752 tracked files, no tracked recovery/junk artifact, and one media asset. `docs/assets/morpheus-security-badge.png` is documented and referenced by the security runbook. | High | Low repository-noise risk. | No cleanup. |

## Test and CI hygiene

- Exact-main run `42603475253` failed only the expired quota-window fixture; the prior main run was
  green.
- `main` requires `node / check`, `pm / pm`, `pr / conventions`, and
  `agent-review / delivery`; force pushes and branch deletion are disabled.
- `deleteBranchOnMerge` is enabled.
- The code-scanning alerts endpoint returned HTTP 404, so this audit makes no negative CodeQL
  claim. Dependabot and local package-audit evidence are the security sources used above.

## Graph and source coverage

The current full graph generation was built from exact main on 2026-11-09 with 17,376 nodes and
65,171 edges, no skipped files, and 13 parse-partial files. Direct reads cover the reported
embedded-template and test-file gaps relevant to this audit. A clean coverage response means no
recorded gap, not proof that callback, generated, or public-package consumers are complete; all
negative deletion conclusions remain bounded accordingly.

## Main-audit fix

- Makes the Factory no-clock-override quota test deterministic by assigning the seven-day window
  a reset relative to the test start. The five-hour window still expires during the delayed
  response, preserving the boundary under test.

## Separate remediation drafts

- [#576 — Factory runtime dependency advisories](https://github.com/cpheinrich/morpheus/pull/576)
- [#579 — root Zod compatibility](https://github.com/cpheinrich/morpheus/pull/579)
- [#570 — root minimatch 11](https://github.com/cpheinrich/morpheus/pull/570)
- [#664 — root MCP SDK 1.32](https://github.com/cpheinrich/morpheus/pull/664)

Superseded [#464](https://github.com/cpheinrich/morpheus/pull/464) remains provenance for the
dependency-only Zod attempt; #579 is the reviewable implementation vehicle.
