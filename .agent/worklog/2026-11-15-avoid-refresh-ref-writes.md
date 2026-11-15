---
date: 2026-11-15
agent: codex
roadmap: MO-26-11-15-00.23.56
tags: [engineering, agent-workflow]
summary: "Verify refresh source without writing Git refs."
---

A fresh desktop session started with workspace-write and outbound network
disabled. Git's remote query reproduced its DNS error in that sandbox. A
network-enabled workspace query reached GitHub, but the original refresh
still failed to create its temporary ref under Git metadata.

The new refresh compares two live observations and uses the existing local
ancestry check. A moving or unreachable trunk still refuses an online receipt.
Startup and claim still prepare source as before.

The regression test failed before the change because Git could not write its
temporary ref. After the change, the regression, the moving-trunk check, and
the existing behind and same-branch rollback tests passed. The compiled CLI
issued the real two-record receipt using the original session's read evidence
in a workspace-write sandbox with network available and Git metadata protected.

- `pnpm exec vitest run tests/session-start.test.ts tests/session-gate.test.ts tests/trunk-changes.test.ts` ran 92 tests.
- `pnpm exec vitest run tests/session.test.ts tests/session-evidence.test.ts tests/session-git.test.ts` ran 79 tests.
- `pnpm typecheck`, `pnpm compile`, `pnpm lint`, `morpheus complexity check`, and `git diff --check` passed.
- `pnpm morpheus pm index` and `pnpm morpheus pm validate` passed.

Independent review reproduced Git matching a longer ref's tail even on a
fully qualified query. Refresh now requires the exact ref name. Real Git
fixtures cover the decoy with the real branch both present and absent. The
CLI also reads the verified commit range locally. A network-enabled Codex
sandbox printed the correct delta after the fixture trunk advanced, with
`FETCH_HEAD` absent before and after refresh.

The final six-file focused run passed 172 tests. Typecheck, compilation,
lint, complexity and whitespace checks passed again.

## Independent review

Independent review reproduced the wrong-ref risk and cleared exact ref matching. A protected sandbox independently printed a local trunk delta without writing FETCH_HEAD.

```morpheus-review
{
  "version": 2,
  "base": "95f97f030f1707629d2a3f4f5f1539e9b9673cf8",
  "reviewed": "37588a34d53e6756900c8ae9e4fc03631ebf7e0e",
  "covered": "e0ea8a44a8b8fc30c071c37b1ca2daaceaeeace2",
  "authorSession": "01a1dc33-4d68-7693-bdbf-f4420f795216",
  "reviewerSession": "/root/context_git_readonly_review",
  "risk": "high",
  "elapsedMinutes": 2.966666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 178000,
    "evidence": "Controller clock at launch 2026-11-15 08:27:12 UTC and reviewer completion at 08:30:10 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review reproduced the wrong-ref risk and cleared exact ref matching. A protected sandbox independently printed a local trunk delta without writing FETCH_HEAD.",
  "contextRead": [
    "AGENTS.md",
    "architecture.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    ".agent/learned.md",
    "docs/runbooks/context-freshness.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/pm-workflow.md",
    ".agent/worklog/2026-11-15-avoid-refresh-ref-writes.md",
    ".agent/worklog/2026-08-05-context-freshness.md",
    ".agent/worklog/2026-10-12-explain-git-timeouts.md",
    "hq/product/roadmap/MO-26-11-15-00.23.56-avoid-refresh-ref-writes.md",
    "hq/product/roadmap/MO-26-08-05-12.24.47-enforce-context-freshness.md",
    "hq/product/roadmap/MO-26-11-14-23.37.24-fleet-worker-build-caches.md",
    "hq/product/roadmap/MO-26-07-29-029-reconcile-claim-time-so.md"
  ],
  "findings": [
    {
      "id": "F-1",
      "severity": "substantive",
      "description": "A fully qualified ls-remote pattern can also match a longer ref tail. Taking the first match could certify an alternate branch.",
      "paths": [
        "src/session/git.ts"
      ],
      "disposition": "fixed",
      "response": "Require the exact advertised ref and a full object ID. Verify exact main wins when both exist and refresh refuses after main is deleted."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/context_git_readonly_review",
      "commit": "e0ea8a44a8b8fc30c071c37b1ca2daaceaeeace2",
      "outcome": "cleared",
      "elapsedMinutes": 1.0166666666666666,
      "timing": {
        "source": "clock",
        "durationMs": 61000,
        "evidence": "Controller clock at follow-up launch 2026-11-15 08:31:43 UTC and reviewer completion at 08:32:44 UTC."
      },
      "scopeReason": "Verify the wrong-ref fix and the local delta reporting change.",
      "summary": "Compiled CLI selected exact main in both real Git regressions. The local delta probe and 172 focused tests passed."
    }
  ]
}
```
