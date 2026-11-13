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
