---
owner: cpheinrich
date: 2026-08-02
agents:
  - claude
previous: .agent/inbox-archive/2026-08-02-0930-cpheinrich.md
---
# Inbox — 2026-08-02

**Your key is live, the review rung works, and it has already earned its keep — after failing in
exactly the way it was designed to prevent.** Item 2 is the whole story and the one worth reading.

**Two decisions recorded while you were away**, both the conservative call: dispatch stays refusing
until a week of beats has been read, and the review rung proves itself on Morpheus before going
anywhere else. Written into `.agent/decisions.md` in [#67](https://github.com/cpheinrich/morpheus/pull/67)
specifically so a future session finding `dispatch: false` beside a working key does not read it as
an oversight and flip it.

**The first scheduled beat is Monday 09:00 Pacific.** Nothing has fired yet — `schedule.yml` merged
on Saturday evening and the cron is weekdays only. Not a fault, just the calendar.

Also shipped since the last cycle: voice handoffs in both directions, and three bugs from
[#60](https://github.com/cpheinrich/morpheus/issues/60) — the third of which only became visible
once the first was fixed.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. The key is on five repos, and does nothing on four of them · `claude`

~ *(previous: "Ok I set the key for morpheus and other repos as well")*

Morpheus is live. The others are not, and it is not their fault — **no repo except Morpheus has an
`agent-review` job in its `ci.yml`**, so the secret sits there unused.

| Repo | `ANTHROPIC_API_KEY` | Calls the review rung |
| --- | --- | --- |
| **morpheus** | ✅ | ✅ working |
| darwin, evo, lakina, heinrichbros.com | ✅ | ✗ nothing calls it |
| **cpheinrich.com** | **✗ missing** | ✗ |

Two things follow. First, `cpheinrich.com` is the one you missed — worth knowing whether that was
deliberate. Second, the four that have the key need about six lines in their `ci.yml` before it does
anything.

That is a deliberate hold, not an omission: we agreed the persona proves itself on one repo before
going on five, because a noisy reviewer is cheaper to tune in one place than to switch off in five.
But you clearly expected the key to be the whole step, so:

- **A — hold as agreed (recommended).** Read the reviews on Morpheus for a week. Roll out when you
  have an opinion on whether they are worth reading. Costs nothing; the keys keep.
- **B — roll out to darwin and evo now.** The two with real product surface, where a wrong-but-clean
  change costs most. Six lines each, and I can do it today.
- **C — roll out to all five.** Consistent, and the personal sites are where you are least likely to
  read a diff closely. Multiplies both spend and noise if the persona needs work.
- **Other —** including "remove the key from the four until they need it", which is the tidier
  version of A.

~

## ❗ 2. The reviewer works, found a real bug in its own fix, and costs $1.14 a review · `claude`

**It runs, and it is good.** But its first live run failed in the way rung 2 was built to prevent:
it reviewed [#68](https://github.com/cpheinrich/morpheus/pull/68) for 3m48s, was denied nine times
trying to post, and **exited green**. Automation mode grants the base GitHub tools but not the ones
that write to a pull request. Fixed in [#69](https://github.com/cpheinrich/morpheus/pull/69).

The uncomfortable part: MO-051's whole argument was that an unconfigured verifier must not report
success. I built the skip path carefully around that and then shipped the state nobody enumerated —
configured, running, and mute, which looks *healthier* than the skip because the warning annotation
is gone too. The tell was timing, not status: 3m48s where a skip took 20s.

**Then it reviewed its own fix, five times, and was right every time.** Two findings were in that
PR's own code — including that two of my three new guards were substring matches that would pass on
a commented-out config block, and then that my *rewritten* guards still passed because YAML does not
strip `#` inside a block scalar. Three findings were in the follow-up item's spec: each of my first
three definitions of "the review landed" would have shipped a detector that reported success in
exactly the state it existed to catch.

**Twice it retracted its own recommendation from the previous pass.** That is the argument for an
independent rung in one line — not that it is right, but that it is independent enough to catch
itself. I also acted once on a recommendation it had already withdrawn, because I read a review
partially. That is in `learned.md` now.

### The cost, which nobody has decided on

| Run | Cost |
| --- | --- |
| #68, first live run | $0.86 |
| #69, five review passes plus final | $7.15 |
| **Total, one bug fix** | **$8.01** |

**$1.14 a review on average**, on `claude-opus-5[1m]` — the action's default, because I pinned no
model. Every push re-reviews, so an iterative PR multiplies. At roughly one PR an hour of active
work that is real money, and the quality above is what it buys.

- **A — pin Sonnet for review, keep Opus for nothing (recommended).** Roughly a fifth the cost.
  The findings above are mostly careful reading of source and cross-referencing records, which
  Sonnet does well; I would rather spend the difference on more repos than on more depth in one.
- **B — leave it on Opus.** The two guard findings were subtle and the self-retractions suggest
  depth is doing real work. If a caught bug is worth more than $10, this pays for itself.
- **C — Opus, but only on pushes that touch `src/`.** Records-only PRs like this one still cost
  $0.86 to be told there is nothing to review. Cheap to implement with a `paths` filter.
- **Other —** including a monthly cap, or on-demand only via `workflow_dispatch`.

~

## ❗ 3. Heartbeat cadence — still unanswered · `claude`

~ *(carried from the last cycle, where it went unanswered)*

`schedule.yml` beats at 09:00 and 17:00 on weekdays. Nothing has run yet, so you have not seen one
and cannot really judge — which is a reason to leave it and revisit Monday rather than decide now.

Restating the one thing worth knowing: **GitHub disables a scheduled workflow after 60 days without
repository activity.** Not a risk today, but it is the failure where a heartbeat stops and nobody
notices, which is worse than never having had one.

- **A — leave it at twice daily (recommended).** Matches the inbox rhythm. Judge it after a week of
  real beats.
- **B — once a day, 09:00.** If two job-summary notifications a day is noise you will start ignoring.
- **C — weekdays plus a Monday-morning-only variant.** Lower volume, but a beat you read is worth
  more than two you skim.
- **Other —** including turning the schedule off and running `morpheus heartbeat` by hand when you
  want it.

~

## ✅ 4. heinrichbros.com — carried, and still yours to call · `claude`

Unchanged from the last cycle and not re-investigated. The duplicate `nodejs_compat` you remember
fixing **is** fixed; it now fails earlier at `ERR_PNPM_IGNORED_BUILDS`, which leaves the old
compatibility-date problem untested rather than resolved. The repo has no committed lockfile at all.

The fix is three things — commit an `onlyBuiltDependencies` list, commit a lockfile, bump wrangler.
You have not said whether you want it, so I have not touched it. Closing this item rather than
re-asking: it is on the list above under repos, and re-posing the same question every cycle is how an
inbox starts getting skimmed.

## ✅ 5. What shipped since the last cycle · `claude`

| PR | What |
| --- | --- |
| [#64](https://github.com/cpheinrich/morpheus/pull/64) | Voice handoffs, both directions — `voice knowledge`, `voice brief`, and two skills |
| [#65](https://github.com/cpheinrich/morpheus/pull/65) | One branch-to-id parser, closing [#60](https://github.com/cpheinrich/morpheus/issues/60) |
| [#66](https://github.com/cpheinrich/morpheus/pull/66) | Prune before listing claims |
| [#67](https://github.com/cpheinrich/morpheus/pull/67) | The two decisions above |

Tests 412 → 512.

**Your issue was half already-fixed and half worse than reported.** The index-link bug had gone in
with #62. The `pm claims` one truncated `CPH-2026` as you saw — but against the id form `pm new`
produces *today* it matched nothing at all, and `if (!m) continue` meant those branches were not
mangled, they were **dropped**. `pm claims` printed "No items are currently claimed" against a remote
full of them, and the heartbeat computed its ceiling from the same empty list.

Then fixing that revealed a third: `listClaims` fetched without `--prune`, so merged branches
lingered as live claims. Mirror image of the first — claims accumulate, the ceiling overcounts, and
after three merges the heartbeat reports a full queue and silently stops. It had been invisible
because the first bug masked it.

Three bugs, one root cause: **a value written twice and drifting.** Both are now single exported
definitions with a test asserting no second copy exists. Recorded in `.agent/learned.md`.

## ✅ 6. Voice handoffs are ready to use · `claude`

```sh
morpheus voice knowledge   # once — upload local/voice/knowledge.md to a claude.ai project
morpheus voice brief "what I want to think about"
```

Then `/voice-handoff` at the end of a session and `/voice-import` when you come back.

**Voice mode does work inside a Project** — I checked the UI rather than reasoning from the docs. The
composer offers it whenever the Chat/Cowork toggle is on Chat; the help-doc caveat is about running
voice *as Cowork*. What I could not verify is whether project knowledge actually reaches the
conversation, so `--full` inlines the explainer and the design does not depend on the answer.

## Parked

**28 stale local branches still block future claims.** Unchanged, still not filed.

**Committing your inbox replies would red CI.** Unchanged. It did not bite this cycle — you replied
in the session rather than the file.

**Evo's brand design session**, **Lakina's Vercel seat**, and **Google billing** — all unchanged, all
yours.
