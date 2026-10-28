---
date: 2026-10-28
agent: claude
roadmap: MO-26-10-28-14.08.53
outcome: review
summary: Trunk rescue resets IDE churn, dedupes by replay, and the GitHub Manager ages rescue drafts out instead of escalating them.
---

# Make trunk-rescue PRs useful or retire them

## Why

Since #362 (2026-10-08) `context brief` opened about nineteen `wip/trunk-*` drafts and none was
adopted. Evo opened ten in two days (#399 era) alternating between two Xcode diffs until #407's
dedupe; the dedupe then missed again on 10-26/10-27 (evo#654, evo#675: the same four hunks, a day
apart). Each unadopted draft was escalated to `manager:needs-human` after 48 hours.

## What changed

- `src/session/trunk-churn.ts` (new): classifies the rescue commit's paths as `user-state`
  (`xcuserdata/`, `.DS_Store`, JetBrains per-user files), `format-only` (a `.pbxproj` whose
  OpenStep structure is equal after dropping whitespace/comments and sorting dictionary keys; an
  `.xcscheme`/`.xcworkspacedata` whose elements/attributes are equal) or `on-trunk` (same
  bytes+mode as the fetched trunk tip, or same Xcode structure). Everything else is real.
- `src/session/trunk-rescue.ts`: when every path is churn, prove the tree equals the commit, reset,
  return `outcome: "churn"`, and print one line naming the unreferenced commit. Mixed sets are
  rescued as before. Dedupe now replays the earlier rescue's patch onto HEAD in a private index
  and compares trees (`git apply --cached --binary --whitespace=nowarn`), over the 20 most recent
  local rescue branches. The PR body states the 7-day age-out.
- `src/gh-manager/sweep.ts` / `decision.ts`: `routeRescuedTrunk` closes an untouched rescue draft
  at `RESCUE_MAX_AGE_DAYS` (7) via a new `close` route reason, re-checked against live state
  (head, draft, auto-merge, review labels, `actions.close`) before acting, with a recovery
  comment; a reopened rescue (marker `close` at the same head) is left alone. No escalation path
  remains for rescue drafts. Every manager close now also removes `manager:needs-human`.
- `trunk-health.ts`: the doctor finding no longer says "nothing is discarded".
- Docs: decisions.md (new entry superseding the escalation lines), learned.md, both runbooks,
  architecture.md. AGENTS.md was left alone: its one-line summary is still accurate and the file
  is 19.6 KB against a 20 KB test.
- Rode along: `pm ship MO-26-09-16-04.21.12`, the only real content in rescue PR morpheus#367
  (issue #249 closed as completed by #267–#284 on 2026-09-26; trunk still said backlog).

## Decisions made without asking

- **Mixed edits rescue everything, churn included**, rather than splitting churn out and resetting
  it. The spec said "only churn → reset"; splitting would need a second proof window for no gain.
- **`.vscode/` is not churn.** Every file VS Code keeps there is shared configuration that people
  edit deliberately. Only JetBrains' documented per-user files are.
- **Strings keep their quoting in the pbxproj canonical form** (`"Evo"` ≠ `Evo`), array order is
  kept, duplicate keys refuse. Value moves such as `DEVELOPMENT_TEAM` or `explicitFileType` are
  churn only when trunk already has them; otherwise they are rescued.
- **Added files are never `user-state`**: a reset deletes a staged addition from disk.
- **Age is measured from the later of the head commit and PR creation**, like every other cooldown;
  a comment does not count as touching it. `actions.close: false` keeps rescue drafts open (skip,
  not escalate).
- The constant lives in `sweep.ts`; the rescue PR body repeats "7 days" as text with a test holding
  them equal, so session start does not load the manager's policy module (zod, gray-matter).

## Considered

`xcode` (Cordova pbxproj parser, 1 dep), `@bacons/xcode` (alpha, 3 deps), `fast-xml-parser`
(6 deps). Forgiving parsers are the wrong property when a misread discards an edit; built ~150
lines instead. `git patch-id --verbatim` for dedupe: keeps whitespace, but ignores line numbers,
so two identical hunks at different places in Evo's pbxproj would collide; replay compares the
outcome the reset depends on. `git merge-tree --merge-base` would also replay but needs Git 2.40+.

## Dead ends

- `claim` prepared its worktree under `/private/var/folders/.../morpheus-worktrees/`, which this
  session's isolation cannot run Git in. Copied the intake file back, detached HEAD in the
  assigned worktree, refreshed and claimed there instead. The prepared temp worktree is left for
  `git worktree prune`.
- A template literal `\0160000` in a test is a legacy octal escape (esbuild refuses); use `\x00`.

## Verification

Focused, final code: `pnpm exec vitest run tests/trunk-rescue.test.ts tests/trunk-churn.test.ts
tests/gh-manager.test.ts tests/session-start.test.ts tests/git-env.test.ts
tests/agent-instructions.test.ts tests/doctor.test.ts` — 7 files, 218 tests passed.
`pnpm typecheck`, `pnpm lint`, `pnpm compile` (dist changes only in the touched modules) and
`pnpm morpheus pm index` / `pm validate` passed.

Mutation check: making the replay refuse whenever the base moved (the old exact-diff behaviour)
fails the new "dedupes the same edit after trunk changed that file elsewhere" test.

Fixture-repo coverage: all-churn reset with fast-forward and untracked files untouched; a real
pbxproj value edit and a reordered `buildPhases` array still rescued; churn beside a real edit
rescued; an edit trunk has since landed reset and restored by the fast-forward; dedupe after trunk
edits the same file elsewhere, and a different edit still rescued. Manager: N−1 days and N days
minus 1 ms kept, N days closed; reopened left alone; close disabled skips; live adoption after the
sweep closes nothing.

Against the real files (fetched with `gh api` into the scratchpad, run through the shipped
`canonicalPbxproj`/`canonicalXml` with `tsx`): the parent and head of evo#675, evo#654 and
kairos#71 differ in bytes and are structurally equal, so all three would now be reset as
`format-only`; Evo's real `main` pbxproj with one `EVO_APP_ENVIRONMENT` value changed is not
equal. Every `.pbxproj` and `.xcscheme` on Evo, Kairos and Lakina `main` parses (no silent
fall-through to "real"); a 47 KB pbxproj parses in about 1 ms. Not run: a live Xcode session
rewriting a trunk checkout end to end — the fixture-repo tests drive the same Git path.

## Review

One fresh reviewer subagent (runner id `ade90a114a0af6d93`, no inherited history) reviewed
`e4fd7b58..d4144002` at high risk (a `git reset --hard` on a person's checkout, and an App closing
pull requests across repositories) in 8.94 minutes by runner metadata. It cleared the change on
one condition. It confirmed the merge of trunk is exact, that compiled `dist/` matches source for
every touched module, and ran the three focused suites (149 passed).

- **F1 (substantive, conditionally cleared):** a `git rm --cached` file was classified as churn (or
  as "already on trunk" once trunk untracked it too), and the reset overwrote the newer file on
  disk while the report claimed it was recoverable. Fixed within the condition: the rescue now
  refuses any path removed from the index that still exists on disk (`stagedRemovalsOnDisk`,
  lstat), before anything is committed or reset, with a runbook line for the new refusal.
- **F2 (incidental, pre-existing since #362):** the same loss in the ordinary rescue and duplicate
  paths. The same refusal fixes it, inside F1's condition paths.
- **F3 (minor):** "already on trunk" assumed a fast-forward that a checkout with local trunk
  commits never gets. Now offered only when HEAD is an ancestor of trunk; `classifyChanges` takes
  `null` for "unknown", so a deletion is not misread as absent from trunk.
- **F4 (minor):** the PR body promised the age-out in projects with no GitHub Manager. It now says
  so only when trunk's `.github/morpheus-gh-manager.json` leaves closing enabled.
- **F5 (minor):** posting the `close` marker before a close that then failed would read as a
  person reopening it, leaving the draft open for good. The rescue close now closes first.

Condition evidence, run on `7446038d`: a fixture test reproducing the probe (untrack
`xcuserdata` with `git rm -r --cached`, keep a newer file, then untrack it on trunk too) asserts
`skipped`, the on-disk content intact, no PR and no branch; with the refusal disabled it fails
with `outcome: 'churn'`. `pnpm exec vitest run tests/trunk-churn.test.ts tests/trunk-rescue.test.ts
tests/gh-manager.test.ts` 152 passed; the seven focused files 221 passed; `pnpm typecheck`,
`pnpm lint` and `pnpm compile` passed.

```morpheus-review
{
  "version": 2,
  "base": "e4fd7b585633f3eaf163121fffe4c8a8ce133978",
  "reviewed": "d4144002be499409ee2039dd765500a1a050cd9a",
  "covered": "7446038df1188940426a58b04dc2d76bf6dacd85",
  "authorSession": "0d17f3e2-e23e-440f-949e-057495fe4e55",
  "reviewerSession": "ade90a114a0af6d93",
  "risk": "high",
  "elapsedMinutes": 8.944316666666667,
  "timing": {
    "source": "runner",
    "durationMs": 536659,
    "evidence": "Claude Code Agent tool result for reviewer agentId ade90a114a0af6d93 (initial turn): usage duration_ms=536659."
  },
  "outcome": "complete",
  "summary": "High-risk review of churn reset, replay dedupe and the manager age-out, cleared on one condition. F1 (substantive, conditional): a git rm --cached file was reset over as churn; fixed by refusing any index removal still on disk before commit or reset, which also fixes the older F2 loss in the rescue path. Minor F3 (on-trunk only when the checkout fast-forwards), F4 (age-out promise only where the manager policy closes) and F5 (close before the marker comment) were fixed by the author.",
  "findings": [
    {
      "id": "F1",
      "severity": "substantive",
      "description": "A path removed from the index with git rm --cached but kept on disk was classified as user-state (or on-trunk once trunk untracked it), and reset --hard overwrote the newer file while the report claimed it was recoverable from the commit.",
      "paths": ["src/session/trunk-churn.ts", "src/session/trunk-rescue.ts"],
      "disposition": "fixed",
      "response": "rescueDirtyTrunk now refuses, before any commit or reset, every path removed from the index (staged deletion, rename source, or unstaged deletion) that still exists on disk by lstat; the churn classifier only ever sees deletions with nothing on disk.",
      "condition": {
        "paths": [
          "src/session/trunk-churn.ts",
          "src/session/trunk-rescue.ts",
          "tests/trunk-churn.test.ts",
          "tests/trunk-rescue.test.ts",
          "dist/session/trunk-churn.js",
          "dist/session/trunk-churn.d.ts",
          "dist/session/trunk-churn.js.map",
          "dist/session/trunk-rescue.js",
          "dist/session/trunk-rescue.d.ts",
          "dist/session/trunk-rescue.js.map",
          ".agent/worklog/2026-10-28-tidy-rescue-prs.md",
          "docs/runbooks/context-freshness.md"
        ],
        "evidence": "A fixture test reproducing the git rm --cached probe asserts the outcome is not churn and the on-disk content survives; then pnpm exec vitest run tests/trunk-churn.test.ts tests/trunk-rescue.test.ts, pnpm typecheck and pnpm compile."
      },
      "conditionMet": "tests/trunk-rescue.test.ts 'refuses a file removed from the index but kept on disk, rather than resetting over it' untracks xcuserdata, keeps a newer file, then untracks it on trunk too; both runs are skipped with the content intact and no PR or branch. With the refusal disabled it fails with outcome churn. vitest on trunk-churn, trunk-rescue and gh-manager: 152 passed; pnpm typecheck and pnpm compile passed at 7446038d."
    },
    {
      "id": "F2",
      "severity": "incidental",
      "description": "Pre-existing since #362: in the ordinary rescue and duplicate paths a staged deletion whose file is still on disk is recorded only as a deletion, invisible to the content proof, and reset --hard overwrites the file.",
      "paths": ["src/session/trunk-rescue.ts"],
      "disposition": "fixed",
      "response": "The F1 refusal runs before the rescue commit is built, so it covers the rescue and duplicate paths too; the refusal is documented in the context-freshness runbook."
    },
    {
      "id": "F3",
      "severity": "minor",
      "description": "on-trunk assumed the fast-forward after the reset, which never runs for a checkout with local trunk commits, so such an edit was reset to HEAD's version.",
      "paths": ["src/session/trunk-churn.ts", "src/session/trunk-rescue.ts", "tests/trunk-churn.test.ts", "tests/trunk-rescue.test.ts"],
      "disposition": "fixed",
      "response": "classifyChurn passes trunk entries only when HEAD is an ancestor of the fetched trunk, else null; classifyChanges treats null as unknown so nothing, including a deletion, is called on-trunk. Unit and fixture tests cover the ahead checkout."
    },
    {
      "id": "F4",
      "severity": "minor",
      "description": "The rescue PR body promised the GitHub Manager would close the draft in every project, though most have no manager policy and the draft would stay open while telling readers to ignore it.",
      "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts", "docs/runbooks/context-freshness.md"],
      "disposition": "fixed",
      "response": "The sentence is included only when the fetched trunk's .github/morpheus-gh-manager.json leaves the manager enabled and closing on; tests cover present, absent and close-disabled policies."
    },
    {
      "id": "F5",
      "severity": "minor",
      "description": "The close marker comment was posted before gh pr close; if the close failed, the next sweep read the marker as a person reopening it and left the draft open with no label.",
      "paths": ["src/gh-manager/decision.ts", "dist/gh-manager/decision.js", "dist/gh-manager/decision.js.map", "tests/gh-manager.test.ts"],
      "disposition": "fixed",
      "response": "closeRescuedTrunk now orders close, then the marker comment, then label removal; a failed close posts nothing and the next run retries. The test pins the order."
    }
  ]
}
```
