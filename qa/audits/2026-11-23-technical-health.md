# Technical health audit — 2026-11-23

Exact baseline: `8c5ef843761bd6798975c5b4c3c5fcb070f17cdb` (`origin/main`). Scope:
3,108 tracked files; package graphs; TypeScript, JavaScript, Python, and Swift source and tests;
tracked assets; repository records; live GitHub checks and protection.

## Executive summary

Morpheus is healthy on the measured baseline. Root production and complete `pnpm audit` scans are
clean, production Knip reports no unused or unlisted dependency, exact-main CI is green, and no
tracked cache/recovery artifact was found. Complexity enforcement passes with no cyclomatic
violation; 113 cognitive warnings remain concentrated in stateful orchestration and governance.

The only 100%-confidence production Vulture candidate is the required second argument of a Python
signal callback. This audit makes its intentionally unused role explicit by renaming `frame` to
`_frame`; behavior and the `signal.signal` callback contract are unchanged. No larger finding has
a sufficiently bounded remediation, so no separate draft PR was created.

## Ranked findings

| Rank | Finding | Specific evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Installed dependency graph is clean** | Root `pnpm audit --prod` and full `pnpm audit` report zero vulnerabilities. Production Knip reports no dependency or unlisted-import issue. | High for the frozen root graph; bounded for dynamic consumers | Low current supply-chain exposure | Re-audit on lockfile changes; keep upgrades focused and independently reviewed. |
| 2 | **Complexity remains concentrated in authority and orchestration paths** | Pinned Lizard 1.25.0 measured 712 files / 17,541 functions, with zero enforced CCN violation and 113 cognitive warnings. Examples include Factory client orchestration and simulator cleanup. | Certain for measured languages; medium for refactor value | Medium review and regression cost in stateful code | Refactor only beside a focused acceptance case with boundary tests; no audit-wide extraction. |
| 3 | **Measured duplication is low but non-zero** | `jscpd@5.4.3` measured 632 source/test files / 151,836 lines: 162 exact clones and 1,411 duplicated lines (0.93%). | Certain for the explicit TS/JS/Python/Swift/YAML scope | Low current drift risk | Treat clone syntax as an inventory; extract only contracts that demonstrably evolve together. |
| 4 | **The sole dead-code candidate is a required callback parameter** | Vulture at 100% flags `guardian.py:on_signal(..., frame)`. Direct source shows it is registered with `signal.signal`, whose handler receives `(signum, frame)`; the value is intentionally unused. | High | Low; the old name implied accidental dead state | Rename to `_frame` in this PR and retain the existing signal-path tests. |
| 5 | **Tracked artifacts and governance show no safe deletion** | Exact baseline has 3,108 tracked files, three tracked image/font/archive assets, and no tracked cache, backup, swap, bytecode, coverage, or OS-metadata pattern. | High for tracked inventory; bounded for semantic reachability | Low repository-noise risk | Preserve referenced assets and generated records; rerun inventory on material tree growth. |
| 6 | **Exact-main CI and protection are healthy** | Main CI run [45129663503](https://github.com/cpheinrich/morpheus/actions/runs/45129663503) passed at the exact baseline. Main requires four checks, forbids force pushes/deletion, and `deleteBranchOnMerge` is enabled. | High | Low immediate delivery risk | Keep the audit PR open for review; do not merge or enable auto-merge in this automation. |

## Coverage and limitations

Morpheus Context supplied current record discovery, cited reads, and source-coverage status. The
codebase-memory exact-checkout install could not take ownership of the existing Claude hook and
Codex configuration, and the graph MCP transport closed. The audit therefore uses direct source,
package, analyzer, Git, and GitHub evidence. Negative dead-code and unused-dependency conclusions
are bounded by analyzer entrypoints, dynamic loading, generated code, and public consumers.

## Low-risk fix in the audit PR

- Rename the required but unused Python signal callback argument from `frame` to `_frame` in
  `plugins/factory/src/guardian.py`; no behavior changes.

## Separate remediation vehicles

None. No current finding justifies a separate implementation branch without broader product or
architecture judgment.
