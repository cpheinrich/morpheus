---
roadmap: MO-26-10-26-12.12.30
tags: [engineering]
---

# Reject mutating explicit ship checks

Issue #421: the explicit-ID path in `pm ship` ignored `--check`. A real temporary
roadmap fixture reproduced both a successful mutation and a partial mutation before
an unknown second ID failed. Both regression cases failed on the original code.

Reject this combination before the item loop; the issue explicitly allows this
resolution. No-ID `pm ship --check` remains a merged-PR drift report. Deliberate
`pm ship <ID>` remains available. The help and PM runbook state both supported forms.
The correction uses an existing domain-specific CLI guard; no package or generic
module is needed.

Tier 2 graph verification used the primary checkout at the identical base,
generation 2026-10-26T18:59:37Z. `ship` calls `markShipped` and `reconcile` and is
called from the PM dispatcher. Coverage reported no recorded gaps for the relevant
CLI, ship, help, dispatcher, tests and runbook paths; this is best-effort evidence.
The branch changes were read directly after editing, because the primary graph
does not index this branch's new source.

## Validation

- `pnpm install --frozen-lockfile` passed.
- `pnpm exec vitest run tests/ship.test.ts tests/cli-dispatch.test.ts`: 127 passed.
  Real-file assertions preserve complete bytes and PR metadata; multiple IDs and
  both flag positions are covered. Manual shipping still updates the expected status.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and `git diff --check` passed.
- Full `pnpm test` ran once as requested: 3302 passed across 115 files in 140.12s.
  The verified actionlint 1.7.12 binary was on PATH. Independent review follows.

## Independent review

Independent reviewer /root/review_ship_check cleared the implementation and identified one minor documentation overstatement about the pre-existing no-ID exit code. The author applied the exact pre-cleared wording correction and git diff --check passed. The reviewer independently verified real-file preservation through four argument arrangements, manual shipping and no-ID checks, generated output, and retained full-suite evidence. No substantive or incidental findings remain; final-head CI is required.

```morpheus-review
{
  "version": 2,
  "base": "e38069785a350b05f6eac5847178f259aaabf348",
  "reviewed": "ec80f497999b373929c49f72f027623066177459",
  "covered": "f0bb6cb63665ce0ba4d70071132c46deed00f85c",
  "authorSession": "01a17993-d3a3-7110-a2ec-bd8329556291",
  "reviewerSession": "/root/review_ship_check",
  "risk": "normal",
  "elapsedMinutes": 4.7,
  "timing": {
    "source": "clock",
    "durationMs": 282000,
    "evidence": "Author invocation clock 2026-10-26T19:21:12Z to completion receipt 2026-10-26T19:25:54Z for /root/review_ship_check initial turn, including tool execution and waits."
  },
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_ship_check cleared the implementation and identified one minor documentation overstatement about the pre-existing no-ID exit code. The author applied the exact pre-cleared wording correction and git diff --check passed. The reviewer independently verified real-file preservation through four argument arrangements, manual shipping and no-ID checks, generated output, and retained full-suite evidence. No substantive or incidental findings remain; final-head CI is required.",
  "findings": [
    {
      "id": "MIN421-1",
      "severity": "minor",
      "description": "The added runbook sentence claimed no-ID --check always exits 1 when roadmap files would change, but a stale branch outcome can return 0. This exit behavior predates the PR.",
      "paths": [
        "docs/runbooks/pm-workflow.md"
      ],
      "disposition": "fixed",
      "response": "Applied the exact pre-cleared replacement: writing roadmap files. Left explicit-ID rejection behavior and documentation intact. Inspected the precise diff and git diff --check passed.",
      "condition": {
        "paths": [
          "docs/runbooks/pm-workflow.md",
          ".agent/worklog/2026-10-26-reject-explicit-ship-check.md"
        ],
        "evidence": "Replace writing roadmap files and exits 1 when they would change with writing roadmap files. Inspect that precise prose correction and run git diff --check."
      },
      "conditionMet": "Exact sentence replacement inspected; git diff --check passed. No implementation change."
    }
  ]
}
```
