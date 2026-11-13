---
date: 2026-11-12
roadmap: MO-26-11-12-20.47.06
tags: [engineering]
summary: "Compile context source globs once and reuse exact matches from the warmed primary index."
---

Precompile the existing minimatch patterns for default coverage, project rules and record kinds.
The same tracked paths, exclusions and citations are returned. No new dependency is needed.

The [original MCP launch warmup](2026-11-09-warm-context-index.md) still runs. Managed Git
updates also warm the primary checkout when it is on the configured trunk. On a worktree cache
miss, check the primary checkout of the same Git repository for the identical corpus fingerprint.
Copy immutable files into the worktree's private pending directory, then publish them atomically.
Tantivy can create its locks in the worktree. Changed paths or contents fall through to a local
build. Use the existing fingerprint, cache and native file cloning with copy fallback. A ripgrep
overlay and a shared writable index would add ranking or sandbox concerns for this scope.

## Verification

- The compiled source-discovery comparison on Evo returned identical coverage for 16 alternating
  before/after pairs, with 1,585 included records. Median was 486 ms before and 34 ms after in
  that run. This measures source discovery, which includes Git's path inventory.
- A disposable repository ran a real fast-forward Git pull through the managed post-merge hook
  and compiled CLI. Main built the index before any MCP call. Separate compiled stdio MCP clients
  proved exact citation and coverage for custom include and exclude globs, a worktree cache hit
  with 0 ms of build time after a non-indexed change, and current results after an indexed
  edit, addition and deletion. Main retained its original results and cache entries.
- The focused context search, MCP, search hook and auto-update suites passed. Typecheck, lint,
  compile, roadmap index and complexity check passed.
- Codebase-memory refused to start while a conflicting generation was active. The installer
  could not safely activate a replacement, so this task verified the relevant source directly.

A second set of 12 alternating Evo source-discovery pairs returned identical coverage and
measured a median of 177 ms before and 11 ms after. Absolute timings varied with host load.

## Independent review

Independent review conditionally cleared the change after identifying damaged primary index adoption and deferred update warming. Both conditions passed the compiled Git and stdio MCP probe.

A pull warmed main despite an unavailable Morpheus release lookup. The first unchanged
worktree reused the index with 0 ms of build time. Another worktree recovered from a missing
Tantivy store file by building locally, then hit its rebuilt cache. The primary was untouched.
The expanded focused suites passed 39 tests.

```morpheus-review
{
  "version": 2,
  "base": "d8b773b3b1dc48c85dd0212ac675967c408a179f",
  "reviewed": "05f74ae47ae78c90ed8f965d6984be460b73cc30",
  "covered": "0b4b19703827fcf1fd59534a1b159dfa396df55b",
  "authorSession": "01a1d2fa-8de9-7fc2-bdcc-66700bb1ee53",
  "reviewerSession": "/root/context_index_review",
  "risk": "normal",
  "elapsedMinutes": 4.579383333333333,
  "timing": {
    "source": "clock",
    "durationMs": 274763,
    "evidence": "Parent runner transcript records fresh reviewer launch at 2026-11-13T04:56:09.782Z and final verdict delivery at 2026-11-13T05:00:44.545Z."
  },
  "outcome": "complete",
  "summary": "Independent review conditionally cleared the change after identifying damaged primary index adoption and deferred update warming. Both conditions passed the compiled Git and stdio MCP probe.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-12-20.47.06-speed-context-search.md",
    "hq/product/roadmap/MO-26-11-09-11.18.21-warm-context-index.md",
    "architecture.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-12-speed-context-search.md",
    ".agent/worklog/2026-11-09-warm-context-index.md",
    ".agent/worklog/2026-11-09-use-context-in-reviews.md",
    ".agent/worklog/2026-11-07-context-search-rollout.md",
    ".agent/worklog/2026-11-07-fix-context-search-sandbox.md",
    "docs/runbooks/context-search.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md"
  ],
  "findings": [
    {
      "id": "CTX-1",
      "severity": "substantive",
      "description": "A damaged primary index was copied into a fresh linked cache and both the initial and repeated MCP search failed.",
      "paths": [
        "src/context-search/engine.ts",
        "src/context-search/tantivy-worker.py",
        "dist/context-search/engine.js",
        "dist/context-search/engine.js.map",
        "dist/context-search/engine.d.ts",
        "dist/context-search/tantivy-worker.py",
        "tests/context-mcp.test.ts",
        "architecture.md",
        "docs/runbooks/context-search.md",
        ".agent/worklog/2026-11-12-speed-context-search.md"
      ],
      "disposition": "fixed",
      "response": "Open the private pending copy with the pinned Tantivy worker before publication. An invalid copy is discarded and the worktree builds a local index.",
      "condition": {
        "paths": [
          "src/context-search/engine.ts",
          "src/context-search/tantivy-worker.py",
          "dist/context-search/engine.js",
          "dist/context-search/engine.js.map",
          "dist/context-search/engine.d.ts",
          "dist/context-search/tantivy-worker.py",
          "tests/context-mcp.test.ts",
          "architecture.md",
          "docs/runbooks/context-search.md",
          ".agent/worklog/2026-11-12-speed-context-search.md"
        ],
        "evidence": "Focused regression and compiled stdio MCP confirmed a healthy shared hit and 0 ms build, a missing primary .store triggering a local rebuild, then a local cache hit with the exact citation and unchanged primary."
      },
      "conditionMet": "Focused regression and compiled stdio MCP confirmed a healthy shared hit and 0 ms build, a missing primary .store triggering a local rebuild, then a local cache hit with the exact citation and unchanged primary. Passed on 0b4b19703827fcf1fd59534a1b159dfa396df55b."
    },
    {
      "id": "CTX-2",
      "severity": "substantive",
      "description": "A successful fast-forward left main cold when the independent Morpheus release check was deferred.",
      "paths": [
        "src/cli/self.ts",
        "src/self-auto-update.ts",
        "dist/cli/self.js",
        "dist/cli/self.js.map",
        "dist/cli/self.d.ts",
        "dist/self-auto-update.js",
        "dist/self-auto-update.js.map",
        "dist/self-auto-update.d.ts",
        "tests/self-auto-update.test.ts",
        "tests/context-mcp.test.ts",
        "architecture.md",
        "docs/runbooks/context-search.md",
        ".agent/worklog/2026-11-12-speed-context-search.md"
      ],
      "disposition": "fixed",
      "response": "Run local warming whenever the enabled managed hook runs, including a deferred, busy or failed CLI update. Preserve the updater result and MCP registration conditions.",
      "condition": {
        "paths": [
          "src/cli/self.ts",
          "src/self-auto-update.ts",
          "dist/cli/self.js",
          "dist/cli/self.js.map",
          "dist/cli/self.d.ts",
          "dist/self-auto-update.js",
          "dist/self-auto-update.js.map",
          "dist/self-auto-update.d.ts",
          "tests/self-auto-update.test.ts",
          "tests/context-mcp.test.ts",
          "architecture.md",
          "docs/runbooks/context-search.md",
          ".agent/worklog/2026-11-12-speed-context-search.md"
        ],
        "evidence": "A real fast-forward pull with the release lookup redirected to an empty bare repository logged the deferral and produced a ready main cache before the first MCP search. The 39 focused tests, typecheck, lint, compile, roadmap index, complexity and diff checks also passed."
      },
      "conditionMet": "A real fast-forward pull with the release lookup redirected to an empty bare repository logged the deferral and produced a ready main cache before the first MCP search. The 39 focused tests, typecheck, lint, compile, roadmap index, complexity and diff checks also passed. Passed on 0b4b19703827fcf1fd59534a1b159dfa396df55b."
    }
  ]
}
```
