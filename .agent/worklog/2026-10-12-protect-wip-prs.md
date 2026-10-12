---
roadmap: MO-26-10-12-11.30.12
date: 2026-10-12
agent: codex
outcome: complete
summary: Hold WIP pull requests and increase the ready PR cooldown to 24 hours.
---

# Keep WIP pull requests out of GitHub Manager merges

The manager previously checked drafts after 48 hours, and a session could mark one ready and
queue auto-merge. Chris clarified that drafts, `wip/` branches, and titles beginning `[WIP]` or
`WIP:` need human input. The sweep now holds them before its cooldown and review routes, cancels
already queued auto-merge, and rechecks the live PR before applying a prior route or session
decision. Rescued trunk drafts still escalate to a human after 48 hours. Ready PRs wait 24 hours
after the later of opening or the latest head commit.

The codebase-memory installer could not activate the exact-checkout index because active sessions
held the service, so the implementation used targeted source reads. Focused manager tests passed
(60 tests); `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index` passed. The full suite
is left to CI because this change does not touch the repository's shared core paths.

## Independent review

One fresh reviewer reviewed 1e7b6fa at high risk. It found one substantive apply-stage gap: WIP could publish screenshot evidence before the guard, and a missing decision could leave queued auto-merge on. The reviewer cleared this on the condition that the early guard and focused regressions be added. Commit 841c121 satisfies that condition; all 62 focused manager tests, typecheck and compile passed.

```morpheus-review
{
  "version": 2,
  "base": "f063880c0002819d9be85901cd0b714c1afbbea5",
  "reviewed": "1e7b6faa4e8efb262b8a7325d102b0dfb32edb78",
  "covered": "841c1217142cbd5eb12d45e8e5918d8a320e4267",
  "authorSession": "01a13160-29e9-7f53-a091-c559bb7a05ae",
  "reviewerSession": "/root/wip_manager_reviewer",
  "risk": "high",
  "elapsedMinutes": 1.1833333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 71000,
    "evidence": "Clock readings around reviewer task /root/wip_manager_reviewer: 2026-10-12 18:34:02 UTC to 2026-10-12 18:35:13 UTC."
  },
  "outcome": "complete",
  "summary": "One fresh reviewer reviewed 1e7b6fa at high risk. It found one substantive apply-stage gap: WIP could publish screenshot evidence before the guard, and a missing decision could leave queued auto-merge on. The reviewer cleared this on the condition that the early guard and focused regressions be added. Commit 841c121 satisfies that condition; all 62 focused manager tests, typecheck and compile passed.",
  "findings": [
    {
      "id": "WIP-01",
      "severity": "substantive",
      "description": "A PR becoming WIP during a session could publish screenshot evidence before apply checked WIP; without a usable decision, queued auto-merge could remain enabled.",
      "paths": ["src/cli/gh-manager.ts"],
      "disposition": "fixed",
      "response": "Moved the live WIP guard before evidence publication and all decision fallbacks. A WIP PR now takes the hold plan, cancelling queued auto-merge even when the session wrote no decision.",
      "condition": {
        "paths": ["src/cli/gh-manager.ts", "tests/gh-manager.test.ts", "dist/cli/gh-manager.d.ts", "dist/cli/gh-manager.js", "dist/cli/gh-manager.js.map"],
        "evidence": "Focused manager tests for late WIP evidence and no-decision paths, pnpm typecheck, and pnpm compile."
      },
      "conditionMet": "Commit 841c121 changed only the conditioned paths; pnpm exec vitest run tests/gh-manager.test.ts passed 62/62, pnpm typecheck passed, and pnpm compile regenerated dist/cli/gh-manager artifacts."
    }
  ]
}
```
