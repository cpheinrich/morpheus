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

Independent high-risk review found that clean, unlocked worktrees could still be in use by another session or process. The author added session-binding and open-process guards. The follow-up found that persistent bindings could prevent later cleanup, so the author added an explicit stale-session release option while retaining the process guard. The same reviewer cleared the final commit; no findings remain.

```morpheus-review
{
  "version": 2,
  "base": "90079a48f668cb6d402679a6b68036ce13af3685",
  "reviewed": "57822dca1ac21d0b568eefd7e567819f3e202dc9",
  "covered": "376b2f40cbaa7ec8fb2988bb3d5c5c561caca55f",
  "authorSession": "01a13771-a9df-7da3-befc-8ec711b92491",
  "reviewerSession": "/root/worktree_cleanup_review",
  "risk": "high",
  "elapsedMinutes": 0.8663333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 51980,
    "evidence": "Reviewer /root/worktree_cleanup_review session event timestamps: task_started 2026-10-13T22:57:33.609Z; task_complete 2026-10-13T22:58:25.589Z."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review found that clean, unlocked worktrees could still be in use by another session or process. The author added session-binding and open-process guards. The follow-up found that persistent bindings could prevent later cleanup, so the author added an explicit stale-session release option while retaining the process guard. The same reviewer cleared the final commit; no findings remain.",
  "findings": [
    {
      "id": "WC-1",
      "severity": "substantive",
      "description": "Cleanup checked Git cleanliness and locks but could delete a clean checkout actively used by another session or process, then erase its binding.",
      "paths": [
        "src/pm/cleanup.ts",
        "src/session/tasks.ts"
      ],
      "disposition": "fixed",
      "response": "Added guards for other session bindings and lsof-detected open processes before proof and immediately before mutation. Cleanup fails closed when activity cannot be checked. Real-Git regressions cover both guards; reviewer cleared the process case."
    },
    {
      "id": "WC-2",
      "severity": "substantive",
      "description": "Treating every saved binding as active indefinitely prevented a later session from cleaning a finished task after its author session ended.",
      "paths": [
        "src/session/tasks.ts",
        "src/pm/cleanup.ts",
        "src/cli/pm.ts",
        "src/cli/dispatch.ts"
      ],
      "disposition": "fixed",
      "response": "Added explicit --release-stale-sessions for an operator who has confirmed prior sessions ended; normal cleanup still refuses other bindings, and the open-process and Git/PR checks remain mandatory. Focused tests cover refusal, explicit release, and live-process refusal with the option; reviewer cleared."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/worktree_cleanup_review",
      "commit": "78591bf3edf1278dba810cf2a238c9fe1134f55f",
      "outcome": "blocked",
      "elapsedMinutes": 0.654,
      "timing": {
        "source": "clock",
        "durationMs": 39240,
        "evidence": "Reviewer /root/worktree_cleanup_review session event timestamps: task_started 2026-10-13T23:01:14.709Z; task_complete 2026-10-13T23:01:53.949Z."
      },
      "summary": "WC-1 process protection passed focused tests, but the persistent binding guard introduced WC-2; cleanup remained blocked."
    },
    {
      "reviewerSession": "/root/worktree_cleanup_review",
      "commit": "376b2f40cbaa7ec8fb2988bb3d5c5c561caca55f",
      "outcome": "cleared",
      "elapsedMinutes": 0.26508333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 15905,
        "evidence": "Reviewer /root/worktree_cleanup_review session event timestamps: task_started 2026-10-13T23:03:49.336Z; task_complete 2026-10-13T23:04:05.241Z."
      },
      "summary": "WC-1 and WC-2 resolved: normal cleanup preserves other bound sessions, explicit stale release permits later cleanup, and lsof protection still applies. No remaining findings."
    }
  ]
}
```
