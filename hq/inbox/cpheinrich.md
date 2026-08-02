---
owner: cpheinrich
date: 2026-08-02
agents:
  - claude
previous: .agent/inbox-archive/2026-08-02-1030-cpheinrich.md
---
# Inbox — 2026-08-02 (afternoon)

**All three replies are acted on and merged** in [#72](https://github.com/cpheinrich/morpheus/pull/72).
Sonnet is pinned, the heartbeat beats hourly every day, and reviews now skip pushes that change no
code. Other repos parked as you said.

**Your question about the five passes had a measurable answer**, and it turned out to matter more
than the model swap. Every push re-triggers a review, and **four of the seven runs read pushes that
changed no code** — three of them successive edits to one roadmap item's prose. That was $4.93 of the
$8.01. Item 1 has the table and what I did about it.

**One correction to something I told you.** I estimated Sonnet at "roughly a fifth the cost". It is
not. Measured on #72 itself: **$0.88 against an Opus average of $1.14 — about 23%, not 80%.** It used
*more* turns to get there, 28 against 20, so turn count dominates rather than per-token price. The
gate is what actually moves the bill; the model swap is a rounding error next to it. Corrected in the
item and in `decisions.md` rather than left standing.

**Sonnet's review quality, on one data point, looks fine** — it caught a stale comment in
`schedule.yml` that the new one contradicted, which is exactly the class of thing a human skims past.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ✅ 1. Why #69 took five passes, and what now stops it · `claude`

~ *(previous: "We can go with A and see how Sonnet does. Why did #69 need five review passes? Could we reduce the number of passes?")*

**Because I pushed five times, and every push buys a review.** Two of those passes earned it — they
found defects in that PR's own guards, and neither would have surfaced without a re-review. The other
three read successive edits to one roadmap item's prose.

| Run | What the push changed | Cost |
| --- | --- | --- |
| #68 | inbox cycle — no code | $0.86 |
| #69 pass 1 | workflow, tests | $0.91 |
| #69 pass 2 | tests, item | $1.24 |
| #69 pass 3 | tests, item | $0.93 |
| #69 pass 4 | **item only** | $1.99 |
| #69 pass 5 | **item only** | $1.17 |
| #69 final | **item only** | $0.91 |

`morpheus review needed` now returns false when the diff is entirely records and board bookkeeping,
and the workflow gates the model call on it. On the run above it would have skipped four, saving
$4.93. The predicate is `hasNoSubstantiveChange`, already shared by `check pr` and `pm ship` — third
consumer, one definition, because this repo spent yesterday fixing three bugs caused by a second copy
of something.

An **unreadable** diff reviews rather than skips: silently disabling the rung the day `git diff`
changes shape is worse than a wasted dollar.

**What it gives up, said plainly:** the reviewer *did* find real problems in item prose — a claim that
a file existed when it did not, and three successive wrong definitions in a detector spec. Those are
now out of scope by construction. If that turns out to matter, the honest fix is a cheaper trigger,
not pretending the gate was free.

## ✅ 2. Hourly beats, and why that is actually cheap · `claude`

~ *(previous: "Set it to run on the hour, every hour, every day of the week. If there is nothing to do then it is cheap.")*

Done — `0 * * * *`. You are right that it is cheap, and it is worth saying *why*, because it was not
guaranteed: the beat is a deterministic ranking function with **no model in it**, so a run that picks
nothing costs a runner minute and writes a job summary.

That was MO-050's most consequential decision, and it was made for a different reason — the handoff
spec described assess as a prompt, and I built it as a ranker so it would be testable and would run
before any API key existed. A prompt-based beat could not have been left on this cadence at any
sensible price. A choice made for testability turned out to decide what cadence was affordable.

You will start seeing beats within the hour.

## ✅ 3. Other repos parked · `claude`

~ *(previous: "Don't worry about the other keys - we'll come back to them.")*

Parked. For when you return to it: four repos hold the key and none has an `agent-review` job, so
nothing is running or spending there; `cpheinrich.com` has no key. Six lines of `ci.yml` each when
you want them.

## ❗ 4. What I would watch over the next few days · `claude`

Nothing needed today. This is a check-in on what would tell us the rung is worth its keep, since one
good review is not evidence.

Three things worth watching:

- **Does Sonnet keep finding real things?** One data point so far. The failure mode is findings that
  are technically true and not worth acting on — that is the noise that gets a rung bypassed, and it
  arrives gradually rather than obviously.
- **Does the gate ever skip something it should not?** It skips board-only pushes, which is where
  roadmap items are written. Worth knowing if a spec problem reaches merge that a review would have
  caught.
- **Are the hourly beats read or ignored?** A heartbeat nobody reads is worse than none, because it
  makes the board look attended.

- **A — report back after a week (recommended).** One short item next cycle: what the reviews caught,
  what they cost, whether the beats were useful.
- **B — only tell you if something goes wrong.** Less noise; the risk is that gradual decline is
  exactly what nobody reports.
- **C — leave it to you to notice.** Cheapest, and reasonable if you would rather form your own view
  before hearing mine.
- **Other —** including a different thing worth watching that I have not thought of.

~

## ❗ 5. Dispatch is still the thing not built · `claude`

Unchanged and deliberately so, but worth resurfacing now that the rest is live and cheap, because
this is the piece your original spec was actually about.

`heartbeat --dispatch` refuses with *"no dispatcher is implemented yet"*. Turning it on is an item,
not a config flip. The decision recorded this morning was to wait until a week of beats has been
read — you cannot judge a ranker you have not watched.

You will have that week's beats by roughly next weekend. Nothing to decide today; flagging it so it
does not quietly become permanent, which is the failure mode for a thing that is off by default and
working fine without it.

~

## Parked

**28 stale local branches still block future claims.** Unchanged, still not filed.

**heinrichbros.com does not boot locally** — `ERR_PNPM_IGNORED_BUILDS`, no committed lockfile. Still
yours to call; a three-line fix in that repo when you want it.

**Evo's brand design session**, **Lakina's Vercel seat**, and **Google billing** — all unchanged.
