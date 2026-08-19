---
date: 2026-08-18
roadmap: MO-26-08-18-22.27.07
agent: claude
---

# Reviews bill the Max plan, not API credits

## Where the $243.36 went, precisely

The Cost console grouped by API key: 100% on `morpheus-key`. By day — Aug 2 $22.98, Aug 3 $7.76,
Aug 4 $3.34, Aug 5 $4.04, **Aug 6 $123.91**, Aug 7 $0, Aug 8 $11.91, Aug 9 $44.26, Aug 10 $0,
Aug 11 $3.72, Aug 12 $21.44, then $0 forever (balance dead).

Aug 6 is 55 CI runs on `mo-26-08-05-16.27.56-gate-durable-governed-actions` — an agent pushing
every ~8 minutes for twelve hours under the old per-push trigger, each push buying an Opus review
(sampled run: 19 turns, $2.28). That day is `learned.md`'s "an agent that iterates diligently is
the worst case" as a line item. Confirmations worth having: the heartbeat's six daily runs cost
$0 (deterministic, as designed), and the invoices themselves explain nothing — they are $20
auto-top-ups firing as the balance drains, so the *consumer* only appears on the Cost page.

## What shipped

`agent-review.yml` takes `claude_code_oauth_token` as a second optional secret and hands it to the
pinned action, which supports it (verified in `action.yml` at our exact SHA). `HAS_KEY` counts
either credential. Both Morpheus callers pass both secrets; Evo's two callers are a separate PR.

## The one decision in it: withhold, don't accompany

When both credentials exist the token wins **and the API key is not passed at all** —
`anthropic_api_key: ${{ secrets.claude_code_oauth_token == '' && secrets.anthropic_api_key || '' }}`.
The action exports whatever it receives, and Claude Code prefers an `ANTHROPIC_API_KEY` in its
environment. Passed both, every review would run green and keep billing the prepaid credits this
change exists to stop billing — a wrong success indistinguishable from the right one, which is
this repo's most-recorded failure shape. The guard test breaks if anyone simplifies the expression
back to a plain pass-through; verified by making exactly that edit and watching it fail.

GitHub's ternary idiom is worth a note: `a && b || c` misfires when `b` is falsy, which here is
exactly the harmless case — an empty api_key falls through to `''`, the same value.

## Verification

881 tests passing, 3 new, each verified by breaking its subject (unconditional key beside the
token; HAS_KEY seeing only the key; a caller dropping the token). The live proof is this PR
itself: it fires a review on open, the token is set, and the API balance is negative — so a
posted review *is* the token working, and the Cost console showing $0 for today is the
acceptance criterion. A `401` here would mean the token, not the balance.
