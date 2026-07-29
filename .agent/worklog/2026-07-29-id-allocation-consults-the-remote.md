# 2026-07-29 — `pm new` allocates against the remote (MO-040)

## What was wrong

`nextId` took `max + 1` over the roadmap files on disk. Those files are the ids that have
**merged** — an id another session claimed lives only on its remote branch until its PR lands.

The repo was in exactly that state while this ran. A parallel session held
`mo-038-brand-prose-templates-break-on-real-answ`; local `main` went MO-001…MO-037, then MO-039.
The gap at 38 was the bug, visible in the file listing. It only failed to bite because MO-039 had
merged an hour earlier and pushed the local maximum past 38.

## What changed

`claimedNumbers(idPrefix, cwd)` in `src/pm/claim.ts` asks `git ls-remote --heads origin` for the
branches staking an id prefix. `nextId` takes the maximum across that and the local files.

Two details that were not obvious going in:

**`mo-*` also matches the goal and request branches.** `mo-g-001-…` and `mo-fr-007-…` share the
prefix, and reading their numbers as roadmap numbers would skip ids forever. Requiring a digit
immediately after the prefix separates them, and that is the case `parseClaimedNumbers` exists to
make testable.

**An unreachable origin cannot report an id as free.** `claimedNumbers` returns `null`, never
`[]`, and `nextId` propagates it as `blind` so `pm new` can print a warning instead of allocating
in silence. Same reasoning as `mergedPrs`, and the third entry under *never let an unanswerable
question render as a confident answer* in `.agent/learned.md`.

## The test that mattered

The suite had no git fixture anywhere — `mergedPrs` is untested and only the pure parts of `ship`
are covered. Following that convention exactly would have left this fix proven only at the parsing
layer, and **a stubbed remote passes against the broken code too**, because the broken code never
called the remote at all. So `originHolding()` builds a real bare repo with real branches. It is
the only such fixture in the suite and the comment says why.

The load-bearing assertion is that an empty product directory plus an origin holding
`mo-038-…` allocates **MO-039**. Old behaviour: MO-001.

## Dead end

Looked for somewhere in `architecture.md` to document allocation and found the claim mechanism is
not described there at all — it lives in `AGENTS.md` and `.agent/decisions.md` only. §12.3 step 2
is stale in a related way: it says work happens on a branch "named `rm-<id>-<slug>`", which is both
the old prefix and the wrong verb, since `pm claim` derives the name rather than anyone choosing
it. Left alone deliberately — that is the second of the three fixes Chris asked for, and folding a
spec edit into this diff would make it two changes wearing one hat.

## Also noticed, not fixed

`pm new` in a directory with `roadmap/` but no `goals/` or `requests/` fails with a raw `ENOENT`
from `pm index` after having already written the item. Unreachable through `morpheus init`, which
creates all three, so it needs a hand-made directory to hit. Not in scope; worth an item if a
third thing ever depends on the product directory being complete.

## Verified

- `pnpm typecheck`, `pnpm test` — 251 passing, up from 242
- Built and run against this repo's real origin: `claimedNumbers('MO-')` returns `[38, 40]`,
  where 38 is the parallel session's claim and appears in no local file
- `pm new` in a directory with no origin prints the warning and still creates the item
