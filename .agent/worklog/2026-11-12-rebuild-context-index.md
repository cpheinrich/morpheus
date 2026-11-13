---
date: 2026-11-12
roadmap: MO-26-11-12-22.53.21
tags: [engineering, agent-workflow]
summary: "Serve unchanged project records while the MCP rebuilds the context index."
---

The MCP keeps a ready source snapshot per worktree and kind filter. An edit detected at
search time starts a build using the existing atomic publication path. Searches in the
meantime return visibly partial results. They map chunk IDs against the original snapshot
and keep only citations whose source still matches the worktree. An exact record read
opens a changed file immediately. Further edits observed during a build replace the
queued snapshot. A build failure leaves the previous index usable and the next search
can retry. This reuses the in-process build tracking and the existing Tantivy worker.

A compiled stdio MCP session on a disposable Morpheus clone edited, added and deleted
tracked records and queried during two held builds. It also edited a second record while
a rebuild was in progress. Partial replies returned in 112–123 ms with the worker held.
Once released, the session found the new text and omitted removed text. The first search,
which had no ready index, took 1.82 s. The focused suites passed 40 tests. Typecheck, lint,
compile, roadmap generation and the enforced complexity check passed. The complexity
check reports an advisory in the trace serializer. The codebase-memory installer could
not activate with other sessions using it, so this task inspected source directly.

## Independent review

Independent review conditionally cleared the change after reproducing a missing citation between two queued rebuilds. The fix promotes the newest published index and passed the held-build regression. The review also confirmed the generated declaration order that CI required.

The final compiled stdio probe returned partial results in 110–119 ms, including the
intermediate published citation. The first search took 1.86 s. Linux CI and the local
compiler produced the same declaration order in dist/cd/schema.d.ts. The subsequent
compile left the committed dist tree clean.

```morpheus-review
{
  "version": 2,
  "base": "b865319db4a63f92e00fe7f1ccceb0a47430298a",
  "reviewed": "d82fc3e2aff9f2deeb2e8cc5f9f45cfd36ffa3bc",
  "covered": "a71f7a6c54b76dc1b525105a7e68e48e0b4db43d",
  "authorSession": "01a1d2fa-8de9-7fc2-bdcc-66700bb1ee53",
  "reviewerSession": "/root/context_rebuild_review",
  "risk": "normal",
  "elapsedMinutes": 5.266666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 316000,
    "evidence": "Parent observed UTC clock readings at 2026-11-13T07:05:31Z before spawning the fresh reviewer and 2026-11-13T07:10:47Z after receiving the verdict."
  },
  "outcome": "complete",
  "summary": "Independent review conditionally cleared the change after reproducing a missing citation between two queued rebuilds. The fix promotes the newest published index and passed the held-build regression. The review also confirmed the generated declaration order that CI required.",
  "contextRead": [
    "AGENTS.md",
    ".agent/decisions.md",
    "architecture.md",
    "docs/runbooks/context-search.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-12-22.53.21-rebuild-context-index.md",
    "hq/product/roadmap/MO-26-11-12-20.47.06-speed-context-search.md",
    "hq/product/roadmap/MO-26-11-09-11.18.21-warm-context-index.md",
    ".agent/worklog/2026-11-12-rebuild-context-index.md",
    ".agent/worklog/2026-11-12-speed-context-search.md",
    ".agent/worklog/2026-11-09-warm-context-index.md"
  ],
  "findings": [
    {
      "id": "CTX-BG-1",
      "severity": "substantive",
      "description": "When a second rebuild is queued, the just-published index is skipped. Partial search then misses a record indexed by the first rebuild whose content remains current.",
      "paths": [
        "src/context-search/engine.ts",
        "tests/context-mcp.test.ts"
      ],
      "disposition": "fixed",
      "response": "Promote the published snapshot while the next build is queued if the ready snapshot has not changed since the build started. An exact cache hit still takes precedence.",
      "condition": {
        "paths": [
          "src/context-search/engine.ts",
          "tests/context-mcp.test.ts",
          "dist/context-search/engine.js",
          "dist/context-search/engine.js.map",
          "dist/cd/schema.d.ts"
        ],
        "evidence": "Hold each queued build independently and assert the exact citation from the intermediate published index and final current results. Rerun focused tests, compile, typecheck and the clean generated output check. The CD declaration may only be regenerated to blob 30ace15bfcc9ac2e7eef1a92acd5cf8c838bd4c1."
      },
      "conditionMet": "The focused MCP regression and the compiled stdio probe both held the second worker after the first publication and returned the expected intermediate citation with partial true. Both verified the final current results. All 40 focused tests, typecheck, compile and git diff --exit-code -- dist passed. The regenerated declaration hash matches the reviewed blob."
    }
  ]
}
```
