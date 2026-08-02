---
date: 2026-08-01
agent: claude
roadmap: MO-26-08-01-23.03.14
outcome: shipped
summary: Issue #60's second bug reached further than reported — the heartbeat's guards run off the same claim list, and the whole suite passed against a parser returning nothing.
---

## Half the issue was already fixed

#60 reported two bugs. The generated-index one was fixed by #62 four commits later, which I
confirmed before touching anything — the `link()` helper already takes the item's path. All that
was left there was a stale orphaned doc comment above the new one.

Worth checking first rather than assuming an open issue is entirely open.

## The reported bug was the smaller half of the real one

The issue reports truncation: `cph-2026-08-01-22.49.21-…` reading as `CPH-2026`. True, and visible —
a human reading the table can see `CPH-2026` is not an item.

What it does against the form `pm new` produces *today*, after #63 normalised to two-digit years, is
worse: **no match at all**. And `listClaims` did `if (!m) continue`, so the branch was not mangled,
it was **deleted from the result**. Every caller reads absence as "nothing claims this".

I only found this because I probed all four id shapes through the old regex rather than reproducing
the one case in the report. The reported symptom was the one that happened to be visible.

## Where it actually reached

`pm claims` is what Chris saw. The consumer that matters is the heartbeat, which computes its entire
view of in-flight work from the same list — so all three of MO-050's guards degraded at once:

- the ceiling counted fewer items than existed,
- a blocked item could not be matched to its claim, so it stopped being excluded,
- a claimed item read as unclaimed and was offered as the next pick.

Enforcement was never affected — `pm claim` refuses via `findClaims`, which uses an explicit
`ls-remote` prefix and never carried this pattern — so nothing was double-claimed. That is luck.
The guard I wrote a few hours earlier and described as load-bearing had quietly stopped bearing.

## Why nothing caught it

Two reasons, and both are now in `learned.md`.

**The parse was welded to a subprocess.** `listClaims` calls `git for-each-ref` and parses inline, so
there was nothing to unit-test. The same file already had `parseClaimedNumbers` split out for
precisely this reason — the lesson was recorded ten lines above the bug and not applied to it.

**Every fixture used `MO-001`.** All 34 heartbeat tests used the legacy id, which is the one shape
the broken parser still handled. So the suite passed, in full, against a claim list that was empty
in reality. A fixture frozen at an old format tests the old format.

Confirmed both by reverting the parser after fixing it: **10 tests fail**, including the ceiling
guard. Before this change, zero would have.

## The fix the issue proposed was right

Chris's suggestion — export the working parser and stop keeping a second copy — is what shipped, with
one adjustment: it moved to `pm/id.ts` rather than being imported from `check/pr.ts`, since `id.ts`
owns the patterns it has to agree with and importing `pm/` from `check/` would have been backwards.
`check/pr.ts` re-exports it, so nothing importing it had to change.

Added a test asserting the two parsers agree across every id shape. Two parsers agreeing is exactly
what stopped being true, and that is cheaper than hoping nobody copies the pattern a third time.

## A third bug, revealed by fixing the second

Seconds after #65 merged, `pm claims` still listed the branch it had just deleted. `listClaims`
fetched without `--prune`, so merged branches survived as local remote-tracking refs and read as
live claims — while `reconcile` in `ship.ts`, asking git the same question, pruned correctly.

The failure is the mirror image of the one just fixed: there claims **vanished** and the ceiling
undercounted; here they **accumulate** and it overcounts, so after three merges the heartbeat
reports a full queue and stops dispatching. A dispatcher that quietly stops is harder to notice than
one that misbehaves.

It had been invisible because the first bug masked it — with `listClaims` returning nothing, there
were no phantoms to see. **Fixing a silent failure surfaces whatever it was hiding**, which is an
argument for looking again immediately after, rather than treating the fix as the end.

Third instance in one session of the same root cause: a value written twice and drifting — the
branch-id pattern, then the fetch argument list. Both are now single exported definitions with a
test asserting there is no second copy.
