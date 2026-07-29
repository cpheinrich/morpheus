# 2026-07-29 — The onboarding heading came from the directory (MO-044)

## How it surfaced

Not by looking for it. While staging MO-040 I ran `git status` and found `hq/onboarding.md`
modified, which I had not edited. Running `morpheus init status` at the start of the session had
rewritten it, and the diff was:

```diff
-# T — setup
+# morpheus — setup
```

The committed heading was `T`. Regenerating produced something different, which is the tell: a
generated file whose content depends on where it was generated from.

## Why it was `T`

`src/cli/onboarding.ts` had `const label = name ?? basename(root)` — the `--name` flag, falling
back to the directory. `morpheus.json` was never consulted, though it declares both
`name: morpheus` and `displayName: Morpheus`.

`git log -S` puts the change in PR #23, "detectors parse what they find instead of trusting a
filename", which had no reason to touch the heading. Someone passed `--name T` while testing, the
regenerated file was swept into the commit, and it survived two more because nothing regenerated
it again.

## The part that would have recurred

Even without the stray flag, `basename(root)` is wrong. The directory is incidental and the
manifest is not — `.agent/decisions.md` already settles this as *the registry indexes; the
manifest is authoritative*. AGENTS.md asks for one git worktree per parallel session, and a
worktree for this item sits in `morpheus-mo-044`; running `init status` from it would have written
`# morpheus-mo-044 — setup`. Every parallel session would fight over the heading.

So the bug had two halves and only one was visible: a wrong value committed, and a mechanism that
would keep producing wrong values.

## Fix

`projectLabel(root)` beside `projectKind(root)`, which already reads the manifest — `displayName`,
then `name`, then basename. An explicit `--name` still wins; that is a deliberate override rather
than a guess. Empty-string declarations fall through rather than rendering a blank heading, which
is the `.trim() ||` rather than `??`.

## Verified

- `pnpm typecheck` clean; `pnpm test` 271 passing, up from 266
- Five tests: `displayName` preferred, `name` as fallback, the directory *not* used when the
  manifest declares one, an empty declaration falling through, and no manifest at all
- Rebuilt and ran `morpheus init status` in this repo: heading is now `# Morpheus — setup`

## Note on the promise

I said "filing separately" in PR #33 when I found this. Filing it as a backlog item and fixing it
cost about the same, so I fixed it. Recording that because "I will file it" is the sort of thing
that quietly does not happen — there was no item until I made one, and nothing would have
reminded anybody.
