# 2026-07-30 — Reconcile refuses to ship what a PR did not do (MO-046)

## The decision I was asked to make

I raised this in the inbox and argued *against* it: `check pr` is the gate, and putting the same
rule in reconcile means two places deciding one thing, which is its own bug. Chris: "I am not
sure, do whatever you think is best here, no strong preference."

I changed my mind, and the reason is worth recording because the original objection was sound.

**The objection was to duplication, not to the second check.** Once `hasNoSubstantiveChange` moved
to `src/paths.ts` and both callers imported it, there is one rule with two call sites — which is
the ordinary shape of defence in depth, not the two-sources-of-truth problem I was worried about.
I had conflated "two places enforce this" with "two places define this".

The second check earns its place because a gate only covers what passes through it. All three
historical instances merged green, because the rule did not exist when they merged. Nothing stops
that happening again with a rule that does not exist *yet* for some future shape.

## Where the predicate lives

`src/paths.ts`, at the root, which needs justifying since nothing else lives there.
`check/pr.ts` already imports `pm/parse.js`, so defining it in `check/` and importing from `pm/`
would be circular, and defining it in `pm/` and importing from `check/` equally so. A dependency
neither side owns is the way out.

## The absence trap, third time today

`MergedPr.files` is `string[] | null`, not `string[]`. Null when `gh` did not return the field.

`didNoWork` returns false on null, and the direction matters: this predicate *refuses* an action,
so a vacuous true would refuse legitimate work whenever the file list could not be read — every
reconcile, the day `gh` renames a field. The guard needs positive evidence of no work, not the
absence of evidence of work.

Extracted from a closure inside `reconcile` to a module-level export purely so that case could be
tested. It is one `&&`, and it is the whole correctness of the change.

## Verified against real data, not only unit tests

`morpheus pm ship --check` in this repo:

```
1 item(s) NOT shipped — the merged PR changed only records and
board files, so it did not do the item's work:
  MO-010  mo-010-simplify-architecture-md-for-first-time (#31)
```

Which is a better answer than before. MO-010 sits in `backlog` with a merged PR, and reconcile
previously reported that under "in backlog with a merged PR — left alone in case the reopen was
deliberate". True but unhelpfully vague: it was not an ambiguous reopen, it was a PR that did
none of the item's work, and now it says so. The `no-work` branch is checked before the `reopened`
branch for that reason.

## Verified

- `pnpm typecheck` clean; `pnpm test` 276 passing, up from 271 on `main`
- Five new tests: the MO-010 file list, one real file defeating it, `null`, `[]`, and the
  formatter reporting without claiming shipped
- Dry reconcile against the real repo, board unchanged
