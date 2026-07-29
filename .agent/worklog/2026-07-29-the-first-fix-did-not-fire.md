# 2026-07-29 — The MO-042 rule did not fire on the case it was written for (MO-043)

## What happened

MO-042's PR said the new `isRecordsOnly` rule "blocks the borrowing that caused this — that is the
exact configuration that shipped MO-010."

It does not. I checked after merging, while answering an open question I had raised in that same
PR about auditing other items. Running the shipped predicate against PR #31's real file list:

```
PR #31 (the one that shipped MO-010) recordsOnly: false
PR #2  (shipped MO-015 wrongly)      recordsOnly: false
a clean future cycle                 recordsOnly: true
```

The exemption half works. The blocking half never fires on a real instance.

## Why it could never have worked

`RECORDS` is `hq/inbox/` and `.agent/`. But a borrowed branch **always** carries `hq/product/`
files as well: `pm claim` reconciles merged items and `pm index` regenerates the tables, both into
the same commit. So a real borrowed-branch PR is never records-only, and the more faithfully it
follows the conventions the less it looks like one.

I wrote the rule from the *description* of the incident — "an inbox cycle rode an unrelated
branch" — rather than from its diff. The description is accurate and the diff is messier, and the
rule was fitted to the tidy version.

That is the durable lesson, now in `learned.md`: **when a rule is written from a remembered
example rather than the example's actual diff, it describes a tidier version of the event than the
one that happened.** Check the file list.

## The fix

`hasNoSubstantiveChange` — records *or* board, so "did this PR do the work of the item its branch
claims?" Kept as a separate predicate rather than widening `RECORDS`, because the two answer
different questions and conflating them has a nasty failure: if "needs no roadmap item" could be
satisfied by touching `hq/product/`, a PR could excuse itself from the roadmap rules by editing
the roadmap.

Blocking, not a warning — a warning would not have stopped any of the three instances. Waivable
via `records-only: <reason>`, mirroring `skip-tests:`, because MO-003 is a genuine case where the
deliverable was the decision itself.

Tests use the actual file lists from PR #31 and PR #2, so the fix is anchored to the real events
rather than to a reconstruction. That is the whole point of this entry.

## The audit that found it

For every `status: shipped` item, compare its `prs:` against that PR's file list:

- **MO-010** — PR #31 did no architecture work. Reopened in MO-042.
- **MO-015** — "init must scaffold .agent and hq/inbox", credited to PR #2, which changed
  `.agent/learned.md` and the item file on branch `mo-015-empty-dirs`. The work was really PR #22
  (`git log -S` on the scaffold lines in `src/init/index.ts` confirms it). Substance shipped,
  attribution wrong; corrected to `prs: [22]`.
- **MO-003** — PR #26, records and board only, but legitimate: the item is
  "Consume the kit as a git dependency, not a published package" and its outcome *was* the
  decision. This is the case the waiver exists for.
- Several early items are `shipped` with no PR recorded at all — they predate `pm ship`. Benign,
  left alone.

## Dead end

Considered making the audit a command (`morpheus pm audit`). Did not: it is a one-off shell loop,
and the new check means the condition cannot recur, so a command would be maintained forever to
detect something already prevented. Recording the loop here is enough — and worth noting that the
first version of it was silently wrong, because `for n in ${prs//,/ }` does not word-split in zsh,
so every multi-PR item went unchecked until I noticed `PR#1 4 unreadable` in the output.

## Verified

- `pnpm typecheck` clean; `pnpm test` 266 passing, up from 259
- Seven new tests, four driven by the real PR #31 / PR #2 file lists, plus the waiver, the
  no-id branch, an ordinary source PR, and the empty-list case
