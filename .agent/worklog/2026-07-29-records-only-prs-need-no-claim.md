# 2026-07-29 — Records-only PRs need no claim (MO-042)

## The ask, and what was underneath it

Chris: "An inbox cycle has no roadmap item of its own, so it has to ride on an unrelated branch to
satisfy `check pr`."

Framed as an inconvenience. It was not. Checking which branch the last cycle rode:

```
$ gh pr view 31 --json headRefName
mo-010-simplify-architecture-md-for-first-time

$ gh pr view 31 --json files
.agent/inbox-archive/2026-07-29-1330-cpheinrich.md
hq/inbox/cpheinrich.md
hq/product/roadmap/MO-010.md
hq/product/roadmap/MO-037.md
hq/product/roadmap/README.md
```

`MO-010.md` was at `status: shipped`, `prs: [31]`. That PR changed only the inbox and its archive.
**"Simplify architecture.md for first-time readers" was marked done without a line of it being
written** — and the inbox in that very PR says "MO-010, simplify `architecture.md`. Claimed, not
started."

Merging the borrowed branch released the claim, and reconcile did exactly what it is supposed to:
saw a merged PR whose branch staked MO-010 and marked the item shipped. The mechanism worked; the
input was a lie.

## The asymmetry worth remembering

`AGENTS.md` already warns that a board lagging reality stops being read — thirteen items had
drifted. A board running *ahead* of reality is worse, and the reason is asymmetric: a lagging item
gets corrected the next time someone looks at it, whereas a shipped item is never looked at again.
MO-010 would have sat there indefinitely.

## The fix

`isRecordsOnly(changedFiles)` — every path under `hq/inbox/` or `.agent/`. Such a PR needs no
roadmap item, so an `inbox-<YYYY-MM-DD>` branch passes clean. The same branch rules that would
have warned about it are skipped.

The other half matters more: a records-only PR on a branch that *does* stake an id is now an
**error**, because that is the exact configuration that shipped MO-010. Made it blocking rather
than a warning — a warning would not have stopped this, and the recovery is renaming a branch.

## The trap I nearly walked into

First version was `changedFiles.every(f => RECORDS.test(f))`. `every` is vacuously true on an
empty array, so a PR with **no detected changes** — a failed `git diff`, a bad base ref — would
have been exempted from every roadmap rule at once.

That is precisely the bug class in `.agent/learned.md`: *a check that skips what is absent will
report an empty thing as correct.* Four instances in one day, and I wrote the fifth within an hour
of reading the entry. The `length > 0` is load-bearing and the comment says so, with a test named
after the failure rather than the behaviour.

Worth noting how it happened: I was not being careless about the empty case, I simply did not
think of `every` as a check at all — it read as a filter. **The rule needs to fire on any
predicate over a collection, not only on things shaped like a check.**

## Repair

MO-010 back to `status: backlog`, `prs: []`, with a blockquote at the top saying why it was
reopened, so nobody reads the reversal as churn.

## Verified

- `pnpm typecheck` clean; `pnpm test` 259 passing, up from 253
- Six new tests: the three `isRecordsOnly` cases including the empty-list regression, and three
  end-to-end — a cycle on `inbox-2026-07-29` produces zero findings, the same cycle on
  `ev-014-something` is a blocking error, and a test plan is still required either way
- This PR does not exercise the new path itself; it changes `src/`, so it is not records-only.
  The next inbox cycle is the first real use.
