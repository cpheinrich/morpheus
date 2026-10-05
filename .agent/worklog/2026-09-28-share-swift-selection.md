---
date: 2026-09-28
roadmap: MO-26-09-25-16.30.01
outcome: review
---

# Share the changed-Swift selection with consumers

`ios-ci.yml` defined which Swift files a change touched in shell, inside a workflow step nothing
outside it could call. The first consumer that wanted the same answer locally — Evo, catching a
formatting violation in a second rather than after a nine-hour queue on a shared Mac mini — had to
reimplement it, and drifted inside one commit: a pathspec without `:(glob)`, which omits a Swift
file directly under the working directory, and no `-z`, which drops a filename outside ASCII. Both
make a local pass that CI contradicts, and both were only findable by comparing two lists by hand.

The selection now lives in `scripts/swift-changed-files.sh`. The workflow reaches it through a
composite action, the package ships it, and `morpheus ios changed-swift` exposes it. Base-ref
policy stays with the caller: CI asks about a commit and its first parent, a developer asks what a
branch changed since the trunk, and only the second has a merge base to speak of.

## Focused local runs

- `pnpm exec vitest run` — 1505 pass across 56 files, including 15 new selection tests
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run compile` — clean, with `dist/` matching `src/`
- `morpheus ios changed-swift apps/ios` in a scratch repository with two commits and no remote,
  from the root and from a subdirectory, and against Evo's real branch

## Not covered locally

The composite action's shell is not executed by any test — no harness here runs
`$GITHUB_ACTION_PATH` — so its wiring is asserted structurally and its first real execution is the
next `ios-ci` run on a consumer. A filename that is not valid UTF-8 cannot be created on this
project's macOS runners, so the Buffer handling is argued rather than demonstrated.

## Independent review

Independent review by session a7a1b3287eb032550 over three turns at high risk, covering the final state of the branch, with one substantive finding and three minor ones, all fixed. The substantive one was that --worktree without --base reapplied an existence filter to commit-derived paths, so a commit that had changed a Swift file reported nothing to lint once that file was absent from disk — a silent under-report, the failure this script exists to remove. It survived the fixes made for two earlier findings and was reachable only through a flag combination no single-flag test covered, which is why the pinning test is now an it.each over both commit-mode shapes. The filter now lives at the sources that can disagree with the disk rather than at the end of the emission. The reviewer also falsified, in four commands, a comment claiming git diff HEAD cannot name a missing path: it can, through skip-worktree, which is the mechanism sparse checkout is built on. That source is now filtered and pinned by a test. The remaining minor findings were a test-plan command form the shipped CLI rejects, an architecture paragraph left with a short line mid-paragraph, and stale counts in the pull request body. The reviewer executed the composite action's shell against a scratch repository and confirmed it reproduces the list the previous inline step produced, confirmed dist matches src by recompiling, and verified all four mode combinations against a fixture holding a skip-worktree phantom, a real uncommitted edit, an untracked file and a committed path deleted from disk. One residual is accepted deliberately: an untracked broken symlink named like a Swift file reaches swift-format and fails there, loudly, rather than being dropped. Two earlier reviewer sessions examined this branch and found six further defects, all fixed and described in the pull request; their records could not be filed because one session was lost and the other exceeded a follow-up turn's budget. Author validation passed 1505 tests across 56 files, typecheck, lint and a clean compile.

```morpheus-review
{
  "version": 1,
  "base": "e60a5b765b2c907a9f29b539c4415ce05e522ed0",
  "reviewed": "cf44c233cc0ee7fa2086c99be7c55f8180adfaf0",
  "covered": "0f6fdffc6b5eacec55d528151b1a48261ce62301",
  "authorSession": "b5b88826-3c4d-5c83-ba32-ec59d254f6d3",
  "reviewerSession": "a7a1b3287eb032550",
  "risk": "high",
  "elapsedMinutes": 6.657416666666666,
  "timing": {
    "source": "runner",
    "durationMs": 399445,
    "evidence": "Runner-reported duration of the reviewer subagent's initial turn."
  },
  "outcome": "complete",
  "summary": "Independent review by session a7a1b3287eb032550 over three turns at high risk, covering the final state of the branch, with one substantive finding and three minor ones, all fixed. The substantive one was that --worktree without --base reapplied an existence filter to commit-derived paths, so a commit that had changed a Swift file reported nothing to lint once that file was absent from disk \u2014 a silent under-report, the failure this script exists to remove. It survived the fixes made for two earlier findings and was reachable only through a flag combination no single-flag test covered, which is why the pinning test is now an it.each over both commit-mode shapes. The filter now lives at the sources that can disagree with the disk rather than at the end of the emission. The reviewer also falsified, in four commands, a comment claiming git diff HEAD cannot name a missing path: it can, through skip-worktree, which is the mechanism sparse checkout is built on. That source is now filtered and pinned by a test. The remaining minor findings were a test-plan command form the shipped CLI rejects, an architecture paragraph left with a short line mid-paragraph, and stale counts in the pull request body. The reviewer executed the composite action's shell against a scratch repository and confirmed it reproduces the list the previous inline step produced, confirmed dist matches src by recompiling, and verified all four mode combinations against a fixture holding a skip-worktree phantom, a real uncommitted edit, an untracked file and a committed path deleted from disk. One residual is accepted deliberately: an untracked broken symlink named like a Swift file reaches swift-format and fails there, loudly, rather than being dropped. Two earlier reviewer sessions examined this branch and found six further defects, all fixed and described in the pull request; their records could not be filed because one session was lost and the other exceeded a follow-up turn's budget. Author validation passed 1505 tests across 56 files, typecheck, lint and a clean compile.",
  "followUps": [
    {
      "reviewerSession": "a7a1b3287eb032550",
      "commit": "ee548a8f442eb87dc47b15adedbaea21a9116ca7",
      "outcome": "blocked",
      "elapsedMinutes": 1.5192166666666667,
      "timing": {
        "source": "runner",
        "durationMs": 91153,
        "evidence": "Runner-reported duration of the first follow-up turn."
      },
      "summary": "Confirmed the filter now sits at the merge-base comparison and that all four mode combinations behave, and that existing_only is safe under pipefail. Blocked on the comment justifying the placement: it claimed git diff HEAD cannot name a path that is not on disk, which the reviewer falsified in four commands using skip-worktree, and noted that an untracked broken symlink survives the -e test's symlink following."
    },
    {
      "reviewerSession": "a7a1b3287eb032550",
      "commit": "0f6fdffc6b5eacec55d528151b1a48261ce62301",
      "outcome": "cleared",
      "elapsedMinutes": 0.6201,
      "timing": {
        "source": "runner",
        "durationMs": 37206,
        "evidence": "Runner-reported duration of the clearing turn."
      },
      "scopeReason": "The final turn on the counterexample the previous turn blocked, at the head of the branch.",
      "summary": "Cleared 0f6fdff against a scratch repository holding all four states at once: a skip-worktree phantom, a real uncommitted edit, an untracked file and a committed path deleted from disk. Raw git names the phantom and the script no longer does, in either worktree combination; the developer's edited and untracked files are still named; commit mode stays unfiltered with --worktree on; and the broken symlink is still emitted, matching what the comment now promises. The reviewer narrowed the accepted residual to that symlink case specifically, since the skip-worktree path it had been accepting on loudness grounds is now filtered and pinned."
    }
  ],
  "findings": [
    {
      "id": "FS-1",
      "severity": "substantive",
      "description": "--worktree without --base reapplied the existence filter to commit-derived paths, so a commit that changed a Swift file reported nothing to lint once that file was absent from disk.",
      "paths": [
        "scripts/swift-changed-files.sh",
        "tests/swift-changed-files.test.ts"
      ],
      "disposition": "fixed",
      "response": "The filter moved to the sources that can go stale, at the point each is produced, so the commit-oriented answer is never filtered whatever else was asked. Pinned by an it.each over both commit-mode shapes."
    },
    {
      "id": "FS-2",
      "severity": "minor",
      "description": "The pull request's only real-consumer verification named a command form the shipped CLI rejects, since the directory is positional rather than --dir.",
      "paths": [
        ".agent/worklog/2026-09-28-share-swift-selection.md"
      ],
      "disposition": "fixed",
      "response": "Corrected in the pull request body in place, saying what it previously claimed, with the command as now written run from both the repository root and apps/ios."
    },
    {
      "id": "FS-3",
      "severity": "minor",
      "description": "An architecture.md paragraph still carried a short line mid-paragraph although the earlier record claimed it rewrapped.",
      "paths": [
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "The paragraph carries through its neighbour; the only short line left ends a sentence in the file's surrounding style."
    },
    {
      "id": "FS-4",
      "severity": "minor",
      "description": "The pull request body carried stale test counts and said the package ships the scripts directory rather than the single file.",
      "paths": [
        ".agent/worklog/2026-09-28-share-swift-selection.md"
      ],
      "disposition": "fixed",
      "response": "Both corrected in the body."
    },
    {
      "id": "FS-5",
      "severity": "minor",
      "description": "A comment asserted that git diff HEAD cannot name a path that is not on disk, which skip-worktree falsifies in four commands \u2014 and the comment is what stops the next reader collapsing the filter placement back.",
      "paths": [
        "scripts/swift-changed-files.sh",
        "tests/swift-changed-files.test.ts"
      ],
      "disposition": "fixed",
      "response": "That source is filtered too, the comment states what is true including the deliberately unfiltered ls-files --others case, and a test pins the skip-worktree phantom being dropped while the developer's real work survives."
    }
  ]
}
```
