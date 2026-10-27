---
date: 2026-10-25
agent: codex
roadmap: MO-26-10-25-04.33.08
tags: [engineering, devops]
outcome: research
summary: Repair missing-worktree pruning while preserving live directories and branches.
---

## Implementation and evidence

The CLI called `worktreeStatus` before `pruneStaleWorktrees`. Inventory skips wholly absent paths correctly, but calls `checkoutIdentity` on surviving paths; a registered directory without `.git` reproduces the reported `git rev-parse --show-toplevel` / not-a-repository error. This fixture establishes the failing code path, not the exact historical filesystem state in Evo. Native global Git prune also removes registrations for surviving directories without `.git`, contrary to the documented missing-directory-only contract.

The prune action now skips full inventory, enumerates registrations from the caller, and uses non-forced Git removal for absent, unlocked paths only. No branch deletion or new dependency. This is a small correction to Morpheus-specific lifecycle policy using its existing Git adapter, not a new generic module.

Regression before implementation: `pnpm exec vitest run tests/worktree-cleanup.test.ts -t 'missing worktree registration pruning'` — 2 failed, 3 passed (13 unrelated tests skipped). The CLI reproduction emits the exact reported Git error; the preservation test shows global Git prune incorrectly drops a surviving directory registration. The first run also exposed fixture teardown assuming every surviving directory has `.git`; teardown now removes isolated fixture data before unregistering it.

Secondary branch-only cleanup remains unchanged. Its exact-PR proof is reusable, but roadmap validation, task session associations and mutation guards are currently bound to the worktree. A separate design should retain equivalent safety for merge and squash PRs, rather than treat an absent checkout as consent to delete branches.

Repository startup preserved a pre-existing documentation edit in WIP draft PR #507 under the required `context brief` routine; that edit is not part of this task. `pm claim` reconciled four already-merged roadmap items in its claim commit. No merge or auto-merge is authorized for this PR.

Focused validation after implementation: `pnpm exec vitest run tests/worktree-cleanup.test.ts` passed all 18 tests, then an additional live-dirty-checkout preservation regression was added and `pnpm exec vitest run tests/worktree-cleanup.test.ts -t 'missing worktree registration pruning'` passed all 6 pruning tests (13 unrelated cleanup cases skipped). `pnpm typecheck`, `pnpm lint`, `pnpm compile`, and `pnpm morpheus pm index` passed. Generated CLI/cleanup output is included.

Graph tooling was unavailable in the session. The required installer check verified the primary checkout, but repair for the task checkout stopped on existing agent configuration ownership warnings. No graph completeness is claimed; direct source inspection covers `src/cli/pm.ts`, `src/pm/cleanup.ts`, `src/session/worktrees.ts`, `src/session/start.ts`, and `src/session/tasks.ts`.

Full validation: `pnpm test` passed 3,085 tests in 108 files (68.07 seconds), including all 19 cleanup/prune tests. This was the single full local suite run, justified by the shared `src/pm` change and explicit acceptance. No failures.

## Independent review response

Initial review of 7a64366727108e17452f23a5e7632fc1ca4e10bd by /root/prune_review found substantive R1: non-forced `git worktree remove` can delete a checkout restored after the absence check, including ignored private data. Accepted. The implementation now resolves the exact administrative directory by its `gitdir` pointer under the caller's canonical common Git directory, preserves existing/locked paths, and deletes registration metadata only. It never passes a checkout path to a deleting operation. Concurrent restoration can need registration repair, but its files and branch remain intact.

Added a deterministic test restoring the checkout immediately before the mutation, after all absence checks; it asserts exact ignored data and tracked file contents plus local and remote branch SHAs. The test initially needed an ESM filesystem module mock to inject the mutation boundary; the first spy-only attempt failed before exercising behavior. On the reviewed implementation it fails because private.txt is deleted; on the corrected implementation it passes. Follow-up review will cover this correction, generated output, tests and documentation.

## Review record

Independent high-risk review found substantive R1: directory-removing Git cleanup could delete a concurrently restored checkout and ignored data. Replaced it with registration-only metadata deletion and added a deterministic restoration regression. The same reviewer cleared the correction after seven focused pruning tests passed; no new findings. Final CI is required before Chris merges. The same reviewer cleared the later declaration repair and both trunk integrations, with no new findings.

```morpheus-review
{
  "version": 2,
  "base": "e4ea3aa6fe14b3a9740efa1bde8ccd94c56b7d27",
  "reviewed": "7a64366727108e17452f23a5e7632fc1ca4e10bd",
  "covered": "7d759d57905ecef2a83e0344159bd2419b8a0fd1",
  "authorSession": "01a172b7-b042-7f62-9bc0-9e93c1745b2a",
  "reviewerSession": "/root/prune_review",
  "risk": "high",
  "elapsedMinutes": 0.8427666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 50566,
    "evidence": "Author clock around /root/prune_review initial invocation: 2026-10-25T11:35:39.335Z to 2026-10-25T11:36:29.901Z."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review found substantive R1: directory-removing Git cleanup could delete a concurrently restored checkout and ignored data. Replaced it with registration-only metadata deletion and added a deterministic restoration regression. The same reviewer cleared the correction after seven focused pruning tests passed; no new findings. Final CI is required before Chris merges. The same reviewer cleared the later declaration repair and both trunk integrations, with no new findings.",
  "findings": [
    {
      "id": "R1-race",
      "severity": "substantive",
      "description": "git worktree remove after an absence check can delete a concurrently restored checkout, including ignored files.",
      "paths": [
        "src/pm/cleanup.ts"
      ],
      "disposition": "fixed",
      "response": "Removed the directory-removing primitive. Resolve exactly one administrative registration by its gitdir pointer and delete metadata only, preserving branch refs and checkout files. Deterministic restoration regression fails on the reviewed implementation and passes after correction. Same reviewer verified the correction."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/prune_review",
      "commit": "6a8928381a6e8defa3c8daacf4bb891e27654f28",
      "outcome": "cleared",
      "elapsedMinutes": 0.46495,
      "timing": {
        "source": "clock",
        "durationMs": 27897,
        "evidence": "Author clock around /root/prune_review follow-up invocation: 2026-10-25T11:38:02.139Z to 2026-10-25T11:38:30.036Z."
      },
      "summary": "R1 resolved; reviewed metadata-only removal, generated output, documentation, and regression. Independently ran seven pruning tests, all passing. No new findings; final CI required."
    },
    {
      "reviewerSession": "/root/prune_review",
      "commit": "7d759d57905ecef2a83e0344159bd2419b8a0fd1",
      "base": "6cb1caf779cffcb08105ebe8f2efe79ae4d96d09",
      "outcome": "cleared",
      "scopeReason": "Late CI correction: restore 27 degraded generated declarations and inspect trunk integrations 104abd3 and f1aeeef0.",
      "elapsedMinutes": 0.70505,
      "timing": {
        "source": "clock",
        "durationMs": 42303,
        "evidence": "Author clock around /root/prune_review late-correction turn: 2026-10-27T00:37:43.990Z to 2026-10-27T00:38:26.293Z."
      },
      "summary": "Same reviewer cleared declaration regeneration and both trunk integrations; all 27 repaired declarations exactly match main. Previously reviewed pruning behavior is unchanged. No new findings; required final-head CI remains the merge gate."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "104abd30951abbbb2fbc06147f5b4de3bfd630ea",
      "reason": "GitHub Manager integrated main a50cdbb1. Named explicitly because review validation reported an unnamed integration; local git show --remerge-diff shows no authored delta. The same original reviewer inspects it in the late-correction turn."
    },
    {
      "commit": "f1aeeef05831618aa7d5fe0c5cb22cd6f90f6e8b",
      "reason": "Integrated main 6cb1caf7 and resolved the generated CLI source-map conflict. This merge accidentally included 27 declarations degraded to any by an incomplete dependency resolution. The subsequent correction restores those exact declarations from the supplied stash and verifies a clean compile is byte-identical; only the original five generated PR files differ from current main. Covered by the same reviewer late-correction turn."
    }
  ]
}
```

Final correction validation: `pnpm exec vitest run tests/worktree-cleanup.test.ts` passed all 20 tests; `pnpm typecheck`, `pnpm compile`, and `pnpm lint` passed. The reviewer independently ran all seven pruning regressions. The full suite passed before R1 correction; CI supplies full-suite coverage for the final head.

## 2026-10-26 authorized merge recovery

Chris explicitly authorized merging #508, superseding the earlier keep-open instruction. Applied stash f31de587a2f5a58c458e2c5763faddafed6723a5 (regen-dist-508); SHA-256 comparison across all dist files before/after `pnpm compile` found no differences. Exactly 27 declaration files were restored, all now identical to origin/main 6cb1caf779cffcb08105ebe8f2efe79ae4d96d09. Only dist/cli/pm.js, its map, and dist/pm/cleanup.d.ts, cleanup.js and its map differ from main. Dropped only the stash entry matched by both SHA and message. `pnpm typecheck` passed.

Named both inherited trunk integrations explicitly, preserving review history. The late correction covers declaration regeneration and both integrations; no source behavior was added.

Comparison at origin/main 6cb1caf7: all six workflow-expression failures reproduce on main with spawnSync actionlint ENOENT (local tool absent). Metering tests pass on both. The branch run also hit an unrelated orphan-supervisor timeout during concurrent batches; that exact test and the meter test both pass serially (2 passed). Main snapshot passed all 54 pilot and 45 native-worker tests. Branch passed all 20 cleanup and 45 native-worker tests. Logs retained locally in /tmp/pr508-focused.log, /tmp/pr508-main-focused.log and /tmp/pr508-pilot-focused.log. No source/test changes were made for those environmental or timing failures.
