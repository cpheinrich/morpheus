---
agent: codex
date: 2026-11-16
roadmap: MO-26-11-16-13.48.32
outcome: review
tags: [engineering, security]
---

# Upgrade Factory host Zod security line

## Mandate

- Outcome: remove the high-severity direct Zod advisory from the optional Factory host without
  combining the dependency upgrade with the weekly audit branch.
- Acceptance: exact Zod 4.6.6 manifest/lock resolution, clean production audit, full host package
  validation, and a focused governed draft pull request linked from the weekly audit.
- Authority: reversible repository and pull-request mutations for this focused remediation only;
  do not merge, enable auto-merge, close pull requests, deploy, dispatch workflows, create
  credentials, change security policy, or spend money.
- Budget: existing local subscription and included CI only; no new spend.
- Stop: the focused draft is open with validated evidence, or a precise blocker is recorded.

## Evidence and implementation

The 2026-11-16 audit measured three production graphs. Root Morpheus and the main Factory runtime
reported zero advisories. `plugins/factory/src/host` reported one high-severity direct finding:
Zod 4.1.12 under GHSA-mrhx-c7xc-m3w5, patched in 4.6.6. No open pull request mentioned the
advisory, host package, or Zod upgrade, so this branch is the focused remediation vehicle.

The implementation changes only the host manifest and its isolated lockfile from Zod 4.1.12 to
4.6.6. The root Morpheus and main Factory runtime already use this exact release. No source,
schema, policy, workflow, or other dependency changed. Draft pull request
[#726](https://github.com/cpheinrich/morpheus/pull/726) is the focused review vehicle.

## Validation

- `pnpm --dir plugins/factory/src/host install --frozen-lockfile` passed and resolved Zod 4.6.6.
- `pnpm --dir plugins/factory/src/host typecheck` passed.
- `pnpm --dir plugins/factory/src/host test` passed: 68 Vitest, 278 Python unittest, and 97 Node
  reporting tests.
- `pnpm --dir plugins/factory/src/host check` passed shell syntax and Python compilation.
- `pnpm --dir plugins/factory/src/host audit --prod --json` reported zero advisories across the
  two direct production dependencies.
- `morpheus complexity check` passed with no measured function because the branch changes only
  Markdown, JSON, and YAML.

Fresh independent review remains pending while the pull request is deliberately a draft.
