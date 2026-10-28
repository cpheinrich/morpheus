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
