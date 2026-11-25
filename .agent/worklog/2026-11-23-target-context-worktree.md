---
date: 2026-11-23
roadmap: MO-26-11-23-12.02.14
tags: [engineering, agent-workflow]
summary: "Read sibling-worktree context without rebinding the reviewer."
---

# Target reviewer context at its source worktree

Issue #691 reports that the launch-scoped MCP cannot read new roadmap and worklog records
in the reviewed task worktree. All five tools now accept an optional absolute `worktree`.
The existing Git identity and worktree inventory validate the target, and Factory's admitted
checkout pin remains enforced. Explicit targets override lookup scope without changing the
session binding. The Claude and Codex post-tool hook validates the same target before checking
the source and recording evidence there. Cross-repository attribution (#687) stays separate.

No dependency or generic module: reuse checkoutIdentity, listWorktrees and sessionGit.
Updated the architecture, runbook and decision record. A small planning diagram in the author
chat showed request scope, validation and evidence attribution before implementation.

## Validation

Frozen install passed. Focused context MCP, task-start and evidence tests passed 67 tests;
these exercise all five tools, unbound and bound sessions, target-only records, symlinks,
foreign/relative/missing/unregistered targets, Factory pins, changed source and both host
response formats. Typecheck, compilation, PM index/validation and complexity enforcement passed.
Full `pnpm test` ran once: 4,678 passed, with six workflow-expression failures caused by
missing actionlint on PATH. All seven tests in that file passed with the existing pinned
1.7.12 executable on PATH. `pnpm lint` passed. No unchanged full-suite rerun.
The compiled stdio probe launched the candidate server in the primary checkout: all five schemas
expose `worktree`; the task-only record fails without a target, succeeds with the task target,
and a foreign repository is refused. Complexity passes for 31 functions in four measured files.
The final focused rerun after reusing listWorktrees again passed all 67 tests.

## Limitations and dead ends

The exact-worktree graph installer refused with ambiguous Codex hook ownership and a Claude
hook configuration ownership warning. No client configuration was overwritten to bypass it.
Primary checkout graph generation 2026-11-23T16:57:38Z had current coverage for the changed source
and tests; direct source reads verified this worktree. Later graph transport closed. Context MCP
initially returned the primary corpus; the exact-checkout CLI read loaded the new task record.

## Independent review

Independent high-risk review cleared the exact published head with no findings. Five selected regressions passed, and all nine generated outputs matched TypeScript emission. Scope confinement, session preservation and host evidence attribution were verified.

```morpheus-review
{
  "version": 2,
  "base": "8c5ef843761bd6798975c5b4c3c5fcb070f17cdb",
  "reviewed": "f2eb85943a4d027a55327088e85c158e6877db1a",
  "covered": "f2eb85943a4d027a55327088e85c158e6877db1a",
  "authorSession": "01a209fd-2dc8-7523-aa73-7ec5401f7f32",
  "reviewerSession": "/root/review_context_worktree",
  "risk": "high",
  "elapsedMinutes": 3.45,
  "timing": {
    "source": "clock",
    "durationMs": 207000,
    "evidence": "Reviewer clock readings during the independent invocation: 2026-11-23 20:10:31 UTC to 20:13:58 UTC; returned with its complete verdict."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the exact published head with no findings. Five selected regressions passed, and all nine generated outputs matched TypeScript emission. Scope confinement, session preservation and host evidence attribution were verified.",
  "contextRead": [
    "AGENTS.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-23-12.02.14-target-context-worktree.md",
    ".agent/decisions.md",
    "docs/runbooks/context-search.md",
    "architecture.md",
    ".agent/worklog/2026-11-08-expose-context-mcp.md",
    ".agent/worklog/2026-11-23-target-context-worktree.md"
  ],
  "findings": []
}
```
