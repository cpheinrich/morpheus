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

- `pnpm exec vitest run` — 1502 pass across 56 files, including 13 new selection tests
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run compile` — clean, with `dist/` matching `src/`
- `morpheus ios changed-swift apps/ios` in a scratch repository with two commits and no remote,
  from the root and from a subdirectory, and against Evo's real branch

## Not covered locally

The composite action's shell is not executed by any test — no harness here runs
`$GITHUB_ACTION_PATH` — so its wiring is asserted structurally and its first real execution is the
next `ios-ci` run on a consumer. A filename that is not valid UTF-8 cannot be created on this
project's macOS runners, so the Buffer handling is argued rather than demonstrated.

## Independent review

Independent review of the shared changed-Swift selection over three turns at high risk, with four findings and two follow-up observations, all fixed. The reviewer read the branch fresh rather than inheriting an earlier session's verdict, which had been lost. Its findings were that the CLI passed --base origin/main unconditionally, so the commit-oriented mode CI uses was unreachable and the command failed outright in a repository whose trunk has another name or no remote; that --worktree emitted paths for files deleted since the commit, which swift-format rejects, breaking the local check for a state CI calls clean; that the CLI decoded git's raw path bytes as UTF-8 and so undid the NUL handling the script exists to provide; and that the help text and architecture.md described behaviour the code did not have. Its follow-up turns found that the existence filter had been applied to commit mode too, where a sparse checkout would silently drop a changed file, and that an architecture paragraph claimed a rewrap that had not happened. The reviewer verified each fix against scratch repositories including byte-fidelity fixtures with embedded newlines and non-ASCII names, confirmed dist matches src by recompiling, and confirmed both original Evo defects are caught by the new tests by mutating the script. Author validation passed 1502 tests across 56 files, typecheck, lint and a clean compile.

```morpheus-review
{
  "version": 1,
  "base": "e60a5b765b2c907a9f29b539c4415ce05e522ed0",
  "reviewed": "96b4b98a2f6a4a827a47b534d6dba6501441e33e",
  "covered": "bad7a1447dbb5d4789c38262c593a9ea76702b23",
  "authorSession": "b5b88826-3c4d-5c83-ba32-ec59d254f6d3",
  "reviewerSession": "a1b06ce7c75da9b24",
  "risk": "high",
  "elapsedMinutes": 32.7,
  "outcome": "complete",
  "summary": "Independent review of the shared changed-Swift selection over three turns at high risk, with four findings and two follow-up observations, all fixed. The reviewer read the branch fresh rather than inheriting an earlier session's verdict, which had been lost. Its findings were that the CLI passed --base origin/main unconditionally, so the commit-oriented mode CI uses was unreachable and the command failed outright in a repository whose trunk has another name or no remote; that --worktree emitted paths for files deleted since the commit, which swift-format rejects, breaking the local check for a state CI calls clean; that the CLI decoded git's raw path bytes as UTF-8 and so undid the NUL handling the script exists to provide; and that the help text and architecture.md described behaviour the code did not have. Its follow-up turns found that the existence filter had been applied to commit mode too, where a sparse checkout would silently drop a changed file, and that an architecture paragraph claimed a rewrap that had not happened. The reviewer verified each fix against scratch repositories including byte-fidelity fixtures with embedded newlines and non-ASCII names, confirmed dist matches src by recompiling, and confirmed both original Evo defects are caught by the new tests by mutating the script. Author validation passed 1502 tests across 56 files, typecheck, lint and a clean compile.",
  "followUps": [
    {
      "reviewerSession": "a1b06ce7c75da9b24",
      "commit": "dc2cd62cea53821e48d3dde152fc6f1fcc18cb3c",
      "outcome": "blocked",
      "elapsedMinutes": 25.1,
      "summary": "Confirmed the four fixes against scratch repositories, and confirmed the baseGiven distinction is additive rather than a trap by enumerating every other reader of flags.base. Blocked on two things the fixes introduced: the existence filter had been applied to commit mode as well, where a sparse checkout omitting a changed Swift file would turn a missing-file error into a clean run, and an architecture paragraph claimed a rewrap that had left a 112-column line and a 17-character orphan."
    },
    {
      "reviewerSession": "a1b06ce7c75da9b24",
      "commit": "bad7a1447dbb5d4789c38262c593a9ea76702b23",
      "outcome": "cleared",
      "elapsedMinutes": 1.5,
      "scopeReason": "The final turn on the two observations the previous turn blocked, at the head of the branch.",
      "summary": "Cleared b8f4b06 and the test this commit adds. The reviewer verified all four mode combinations against a fixture holding a deleted-from-disk committed file, an embedded newline and a non-ASCII name: commit mode still names the missing path, and base and worktree modes drop it. It confirmed byte fidelity survives the new read loop with od -c, that both branches exit 1 on a bad base and 0 on an empty selection, that set -u is satisfied, and that architecture.md's paragraph is now within its wrap and its claim about the test accurate. It agreed with declining the optional decode-boundary refactor as an exported surface bought for a case that cannot occur on this project's runners. Its one remaining suggestion, specified with its exact assertion and run by hand, was to pin that commit mode does not filter, since the if and else could be collapsed back without failing any other test; that test is this commit, added within the clearance."
    }
  ],
  "findings": [
    {
      "id": "SS-1",
      "severity": "substantive",
      "description": "morpheus ios changed-swift always passed --base origin/main, so the commit-oriented mode CI uses was unreachable and the command failed outright in a repository whose trunk has another name, is a fork, or has no remote.",
      "paths": [
        "src/cli/dispatch.ts",
        "src/cli/args.ts"
      ],
      "disposition": "fixed",
      "response": "parseArgs records baseGiven only when the flag is typed, and the ios command passes base only then. Verified in a scratch repository with no remote. The distinction is pinned by cli-args.test.ts."
    },
    {
      "id": "SS-2",
      "severity": "substantive",
      "description": "--worktree emitted paths for files the branch added and the developer had since deleted or renamed uncommitted, which swift-format rejects as missing \u2014 the local check failing for a state CI calls clean.",
      "paths": [
        "scripts/swift-changed-files.sh",
        "tests/swift-changed-files.test.ts"
      ],
      "disposition": "fixed",
      "response": "The emission is filtered to what exists, for the modes that ask about a developer's tree only, with an if rather than an && so a final missing path does not fail the script under set -e."
    },
    {
      "id": "SS-3",
      "severity": "minor",
      "description": "The CLI printed repository-relative paths while being documented for xargs -0 from the app directory, and the help line did not say so.",
      "paths": [
        "src/cli/help.ts"
      ],
      "disposition": "fixed",
      "response": "The help line says repository-relative and states what omitting --base means."
    },
    {
      "id": "SS-4",
      "severity": "minor",
      "description": "The CLI decoded git's raw path bytes as UTF-8, so a filename that is not valid UTF-8 would come back as U+FFFD \u2014 the loss the script's NUL delimiter exists to prevent.",
      "paths": [
        "src/ios/changed-swift.ts"
      ],
      "disposition": "fixed",
      "response": "spawnSync runs without an encoding and the output is split on the NUL byte as a Buffer. The reviewer confirmed no end-to-end test is constructible on this project's macOS runners, which reject such filenames outright, so the guard is the recorded comment rather than a spec."
    },
    {
      "id": "SS-5",
      "severity": "substantive",
      "description": "The existence filter was applied to commit mode as well, where paths come from the commit being linted: on a sparse checkout whose cone omits a changed Swift file, dropping it silently turns a missing-file error into a clean run.",
      "paths": [
        "scripts/swift-changed-files.sh",
        "tests/swift-changed-files.test.ts"
      ],
      "disposition": "fixed",
      "response": "The filter is gated on a base or worktree question being asked, so commit mode emits unfiltered and stays loud. Pinned by a test the reviewer specified and ran."
    },
    {
      "id": "SS-6",
      "severity": "minor",
      "description": "An architecture.md paragraph claimed a rewrap that had not happened, leaving a 112-column line and a 17-character orphan mid-paragraph.",
      "paths": [
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "The paragraph is rewrapped within its 100-column convention, including two neighbouring lines from the earlier commit."
    }
  ]
}
```
