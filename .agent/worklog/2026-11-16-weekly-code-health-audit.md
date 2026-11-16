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

Audited exact `origin/main` `898406bd6873041b4edd785b7b3e8533627fee19` after integrating the
focused dependency remediations that landed during this run.

- Root, Factory, and Factory-host audits are clean both with and without `--prod`.
- #726 changed externally from draft/open to merged at 2026-11-16T22:17:07Z as main `0bcbc251`.
  This automation did not merge, close, or enable auto-merge on it and did not create a replacement.
- #730 then merged externally at 2026-11-16T22:36:20Z as main `08e0ba63`, and #728 merged externally
  at 2026-11-16T22:41:42Z as main `898406bd`. This automation did not merge, close, or enable
  auto-merge on them. #698 and #704 closed externally without merge after the graphs became clean.
- `jscpd@5.4.3`: 426 production files / 87,750 lines, 40 clones, 394 duplicated lines (0.45%).
- Complexity: 677 files / 16,419 functions, zero CCN violation, 109 cognitive warnings. No broad
  state-machine refactor was justified on an audit branch.
- The initial 100%-confidence dead-code scan found one candidate: a production `sys` import used
  only as a test patch seam. The audit removes it and patches built-in `sys.argv`; the exact-final
  scan covers 416 files / 18,614 symbols / 76 entry points and reports no candidate.
- Root production Knip is clean. Direct imports disprove Factory/host whole-manifest false positives.
- Exact baseline: 2,956 tracked files, no tracked junk/recovery pattern. The two closeout blobs and
  security badge are small, documented or record-referenced assets.
- #728 head run `43971799807` passed all named jobs immediately before exact main. Branch
  protection requires four checks, rejects force pushes/deletion, and `deleteBranchOnMerge`
  remains enabled.
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

- #726: https://github.com/cpheinrich/morpheus/pull/726 (merged externally during the audit)
- #730: https://github.com/cpheinrich/morpheus/pull/730 (created and merged externally during the audit)
- #728: https://github.com/cpheinrich/morpheus/pull/728 (merged externally during the audit)
- #698 and #704: closed externally without merge after their findings were superseded.

## Independent review

Pending fresh review of the exact committed audit head.
