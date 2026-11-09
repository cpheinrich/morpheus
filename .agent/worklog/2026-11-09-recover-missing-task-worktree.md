---
date: 2026-11-09
roadmap: MO-26-11-09-15.12.47
tags: [engineering]
---

# Recover a missing bound worktree

Issue #430 came from a downstream task that had merged and whose linked checkout had already disappeared. Startup used the saved path as Git's working directory, so a working Git installation reported ENOENT. Startup now identifies the missing checkout. An explicit command from the primary checkout can clear the exact task association for the specified session after the operator verifies the task's disposition. It refuses an existing checkout or mismatched task ID.

The regression uses a real removed Git worktree, starts the affected session before and after recovery, and checks that a second session's binding remains present. Startup, CLI dispatch and cleanup suites passed all 152 tests. Typecheck, compile, PM index and enforced complexity passed.
