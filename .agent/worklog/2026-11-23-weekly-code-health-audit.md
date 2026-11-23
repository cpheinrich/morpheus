---
agent: codex
date: 2026-11-23
roadmap: MO-26-11-23-09.15.11
outcome: review
tags: [engineering, devops, security]
---

# Weekly code-health audit

## Mandate

- Outcome: one current Morpheus audit package plus coherent safe cleanup.
- Acceptance: ranked current evidence across dependencies, dead code/assets, obsolete files,
  duplication, complexity, tests/CI, and governance; safe cleanup implemented; proportional
  validation and independent review; open PR with auto-merge disabled.
- Authority: reversible repository and PR mutations only. No merge, close, auto-merge, workflow
  dispatch, deployment, credential creation, or spend.

## Evidence and decisions

Audited exact `origin/main` `8c5ef843761b` in the claimed isolated worktree.

- Root production and complete dependency audits are clean; production Knip reports no issue.
- `jscpd@5.4.3`: 632 files / 151,836 lines, 162 clones, 1,411 duplicated lines (0.93%).
- Complexity: 712 files / 17,541 functions, zero CCN violation, 113 cognitive warnings.
- Vulture's only production candidate is the required `signal.signal` frame argument. Renaming it
  `_frame` makes the intentional non-use explicit without changing behavior.
- Exact baseline has 3,108 tracked files and no tracked junk/recovery pattern.
- Exact-main CI run 45129663503 is green; protection requires four checks and repository branch
  deletion on merge remains enabled.
- Exact codebase-memory indexing was unavailable because hook ownership was ambiguous and the MCP
  transport closed. Negative claims use bounded direct evidence.

## Validation

- `python3 -m py_compile plugins/factory/src/guardian.py` — pass.
- `node --test plugins/factory/tests/unattended-worker.test.mjs` — 38/38 pass; covers real guardian
  interruption, deadlines, descendant cleanup, admission, and checkpoint behavior.
- `morpheus complexity check` — pass; one changed function, no finding.
- `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index` — pass/unchanged.
- `pnpm morpheus pm validate`, `pnpm morpheus team validate`, `pnpm morpheus inbox validate`, and
  `git diff --check` — pass.
- Full local suite not run: the change is one callback-parameter rename; the focused guardian
  integration suite is the direct boundary, and hosted CI owns the complete suite.

## Remediation links

None.
