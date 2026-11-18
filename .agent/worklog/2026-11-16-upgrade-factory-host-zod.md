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

## Review correction: minute-precision wire timestamps

Independent review found that Zod 4.6.6's `z.iso.datetime({ offset: true })` requires seconds,
while host wire v1 under Zod 4.1.12 accepted minute precision from external producers. The
host `stamp` in `plugins/factory/src/host/reporting/protocol.mjs` is now the union of the default
offset schema and `precision: -1`, the same compatibility boundary as `src/iso-datetime.ts`
(MO-26-11-02-10.58.33). A regression in `tests/scheduled-tasks.test.mjs` accepts a minute-only
`Z` `observedAt` and offset `nextAt`, and rejects zoneless values. It fails against both the
pre-fix schema and a minute-only schema. `origin/main` (e128490b) was merged cleanly first.

- `pnpm --dir plugins/factory/src/host install --frozen-lockfile` — up to date.
- `pnpm --dir plugins/factory/src/host typecheck` and `check` — passed.
- `pnpm --dir plugins/factory/src/host test` — 68 Vitest, 278 Python unittest, 98 Node reporting
  tests passed.
- `pnpm --dir plugins/factory/src/host audit --prod --json` — zero advisories, two dependencies.

## Independent review

An independent Factory reviewer found that the upgrade narrowed wire v1 timestamp precision and prescribed a bounded compatibility fix. A separate implementation worker satisfied the condition and verified the previous minute-only formats and the zone requirement. The controller independently reran all seven scheduled-task tests and the clean production audit, and verified that Git reproduces the trunk merge exactly. The weekly audit backlink remains with that separately authored audit.

```morpheus-review
{
  "version": 2,
  "base": "8609a6d639e160648e1e039cd60e387f86e24443",
  "reviewed": "1053464d8defb6af692aebc8a374e8a6182cee71",
  "covered": "23aea09af2c29e92f30ec96d27ec732621dfb90e",
  "authorSession": "01a1e65c-0355-76c1-8402-a96d3e0a8c43",
  "reviewerSession": "92d30e72-2b50-4cee-a175-f5ca0d114273",
  "risk": "normal",
  "elapsedMinutes": 2.13495,
  "timing": {
    "source": "runner",
    "durationMs": 128097,
    "evidence": "Claude result duration_ms=128097 in Factory run 7e65c307-371a-4afe-a4f3-9b6282998ca6 events.jsonl."
  },
  "outcome": "complete",
  "summary": "An independent Factory reviewer found that the upgrade narrowed wire v1 timestamp precision and prescribed a bounded compatibility fix. A separate implementation worker satisfied the condition and verified the previous minute-only formats and the zone requirement. The controller independently reran all seven scheduled-task tests and the clean production audit, and verified that Git reproduces the trunk merge exactly. The weekly audit backlink remains with that separately authored audit.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-16-13.48.32-upgrade-factory-host-zod.md",
    ".agent/worklog/2026-11-16-upgrade-factory-host-zod.md",
    "hq/product/roadmap/MO-26-11-02-10.58.33-preserve-zod-datetime.md",
    ".agent/decisions.md",
    "plugins/factory/src/host/reporting/README.md",
    "src/iso-datetime.ts"
  ],
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "Zod 4.6.6 default ISO datetime requires seconds, rejecting wire v1 producer timestamps previously accepted at minute precision.",
      "paths": [
        "plugins/factory/src/host/reporting/protocol.mjs",
        "plugins/factory/src/host/reporting/tests/scheduled-tasks.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Match the earlier root Zod compatibility contract with a union of default and minute-only offset schemas. Pin both accepted offsets and zoneless rejection.",
      "condition": {
        "paths": [
          "plugins/factory/src/host/reporting/protocol.mjs",
          "plugins/factory/src/host/reporting/tests/scheduled-tasks.test.mjs",
          ".agent/worklog/2026-11-16-upgrade-factory-host-zod.md"
        ],
        "evidence": "Use the union with precision -1 for the second schema; test minute-only Z and explicit offset timestamps and zoneless rejection; run the host frozen lock install, full host test and the host production audit; record the change in the worklog and PR body."
      },
      "conditionMet": "Commit 23aea09a is confined to the condition paths. Frozen lock install passed, 68 Vitest, 278 Python and 98 Node tests passed, and the production audit returned zero advisories. Controller independently passed all seven scheduled-task tests and the production audit."
    },
    {
      "id": "N01",
      "severity": "minor",
      "description": "The weekly audit branch had no link back to PR #726 at review time.",
      "paths": ["hq/product/roadmap/MO-26-11-16-13.48.32-upgrade-factory-host-zod.md"],
      "disposition": "disputed",
      "response": "The audit is a separate branch with its own author. This records the connection and keeps the audit publication independent of delivery of this remediation."
    }
  ]
}
```
