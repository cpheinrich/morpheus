---
roadmap: MO-26-09-16-00.36.07
---
# Place task worktrees in temp and clean completed tasks

Resumed the September 16 claim after Chris reported many `~/code/evo-*` sibling folders.
The branch held uncommitted cleanup code and was 190 commits behind trunk. Preserved that
work in a WIP commit, merged current trunk, and resolved the one `sessionGit` conflict by
retaining both Git environment isolation and untrimmed porcelain output support.

New task allocations now use the OS temporary directory, keyed by common Git directory;
legacy paths still resume in place. `pm cleanup <ID>` checks exact merged PR evidence,
current trunk and branch ancestry, and the linked worktree's state before deleting it and
obsolete refs. It preserves tracked, untracked and ignored local data, except reproducible
`node_modules` caches. `pm worktrees` inventories all linked checkouts; pruning only clears
registrations whose directories are missing. Startup does not remove a checkout that another
session might still be using. No new Git wrapper package was added; the previously recorded
simple-git evaluation and native Git implementation remain applicable.

Independent review found that clean and unlocked did not prove a checkout was idle.
Cleanup now refuses another session binding and uses `lsof` to refuse a process with an
open handle or working directory in the checkout. It fails closed if process activity
cannot be checked. Two focused regression tests cover those guards; all eight cleanup
tests and TypeScript checking pass after the change.

The second review caught a lifecycle limit: bindings remain after their session exits.
The default guard stays conservative. An operator who has confirmed the prior sessions
ended can pass `--release-stale-sessions`; the open-process check and all Git/PR proof
remain mandatory. The focused test covers both refusal and explicit release.

Focused validation: `pnpm exec vitest run tests/worktree-cleanup.test.ts
tests/session-start.test.ts tests/ship.test.ts tests/cli-dispatch.test.ts tests/init.test.ts`
passed 217 tests. `tests/worktree-cleanup.test.ts` exercises real Git remotes, a squash
merge, a legacy sibling checkout, temp allocation, dirty and ignored data, an open PR,
and branch cleanup with a fake GitHub response. The ignored-file test initially caught a
real deletion bug: Git's normal status was clean while `git worktree remove` deleted the
file. `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index` passed.

The one allowed local full run, `pnpm test`, passed 2,142 of 2,143 tests across 79 files.
The failing generated AGENTS size guard reported 16,257 bytes against a 16,000-byte limit.
After shortening the new instruction, `pnpm exec vitest run tests/agent-instructions.test.ts`
passed all 14 tests. CI will run the full suite on the final commit; the local full suite was
not repeated. A live `pm cleanup MO-26-10-12-15.26.15 --dry-run` against Morpheus correctly
refused removal of its merged worktree because ignored `local/` data remains.
