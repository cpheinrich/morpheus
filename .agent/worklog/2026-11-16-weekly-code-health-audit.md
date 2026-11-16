---
agent: codex
date: 2026-11-16
roadmap: MO-26-11-16-13.44.35
outcome: review
tags: [engineering, devops, security]
---

# Weekly code-health audit

## Mandate

- Outcome: one current Morpheus audit package plus coherent safe cleanup.
- Acceptance: current evidence across dead code/assets, unused dependencies, obsolete files/config,
  duplicates, test/CI hygiene, and structural/convention drift; ranked evidence/confidence/impact/
  action; current remediations linked; reviewed, pushed, and validated PR state.
- Authority: reversible repository and PR mutations only; no merge, close, auto-merge, deploy,
  credential creation, workflow dispatch, or spend.
- Budget: existing local subscription and included CI only; no new spend.
- Stop: the requested open review package, or a precise blocker after safe alternatives are
  exhausted.

## Evidence and decisions

Audited exact `origin/main` `0bcbc251cbfd12cc8215c922b51dda180447ebab` after integrating the
Factory host Zod remediation that landed during this run.

- Root, Factory, and Factory-host production audits are clean. Root's full graph has 1 high / 3
  moderate development advisories. Factory host's full graph has 3 critical / 1 high / 10 moderate
  / 1 low development advisories.
- Draft #728 removes the root `re2js` high and two `@vitest/mocker` moderate findings; open #704
  owns the remaining root `minimatch` finding.
- #726 changed externally from draft/open to merged at 2026-11-16T22:17:07Z as main `0bcbc251`.
  This automation did not merge, close, or enable auto-merge on it and did not create a replacement.
- #698 closed externally without merge. Its one-package mocker override was stale and incomplete;
  replacing it safely requires a direct Vitest major upgrade across the complete 443-test host
  boundary.
- `jscpd@5.4.3`: 424 production files / 87,903 lines, 33 clones, 354 duplicated lines (0.40%).
- Complexity: 677 files / 16,393 functions, zero CCN violation, 109 cognitive warnings. No broad
  state-machine refactor was justified on an audit branch.
- The 100%-confidence dead-code scan covered 436 files / 19,153 declarations / 80 entry points and
  found one candidate: a production `sys` import used only as a test patch seam. The audit removes
  it and patches built-in `sys.argv`; the repeated scan reports no candidate.
- Root production Knip is clean. Direct imports disprove Factory/host whole-manifest false positives.
- Exact baseline: 2,948 tracked files, no tracked junk/recovery pattern. The two closeout blobs and
  security badge are small, documented or record-referenced assets.
- Exact-main run `43966157068` passed all named jobs. Branch protection requires four checks,
  rejects force pushes/deletion, and `deleteBranchOnMerge` remains enabled.
- Exact codebase-memory indexing was unavailable because active sessions could not be stopped
  safely. Direct analyzers/source/package/Git/GitHub evidence was used; negative claims are bounded.

## Validation

- `python3 -m unittest plugins/factory/src/host/tests/test_validate_consumer_main.py`: 5/5 pass.
- `python3 -m py_compile plugins/factory/src/host/worker/validate_consumer_main.py plugins/factory/src/host/tests/test_validate_consumer_main.py`: pass.
- `morpheus complexity check`: pass; 5 touched functions / 13 total in 2 files.
- `pnpm morpheus pm validate`, `pnpm morpheus team validate`, and
  `pnpm morpheus inbox validate`: pass.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, the focused tests after the final
  main merge, and `git diff --check`: pass.
- Full local `pnpm test` not run: this audit changes no shared core; exact-head CI is the complete
  suite boundary.

## Remediation links

- #728: https://github.com/cpheinrich/morpheus/pull/728
- #704: https://github.com/cpheinrich/morpheus/pull/704
- #726: https://github.com/cpheinrich/morpheus/pull/726 (merged externally during the audit)
- #698: https://github.com/cpheinrich/morpheus/pull/698 (closed externally without merge)

## Independent review

Pending fresh review of the exact committed audit head.
