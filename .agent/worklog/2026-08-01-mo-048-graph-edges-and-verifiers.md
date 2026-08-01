---
date: 2026-08-01
agent: claude
roadmap: MO-26-08-01-048
outcome: shipped
summary: Specified the work graph, blocked as a third exit, and the verifier stack; the useful finding was that all three edges were already declared in the schema and never traversed.
---

## Where the item came from

A handoff spec written in a voice session with no access to this codebase
(`local/handoffs/2026-08-01-heartbeat-and-verifiers.md`). It said so itself and told me to defer to
the codebase on conflicts, which turned out to be the most valuable line in it.

## The finding worth keeping

I went looking for "net-new edges worth making explicit" expecting to invent some. Instead every
edge worth drawing was **already declared in the schema and traversed by nothing**:

- `JournalEntry.outcome` has had `blocked` in its enum since MO-001. The spec's entire Part 2 —
  "give agents a third exit" — was asking for an edge out of a value that already existed.
- `RoadmapItem.acceptance` is documented as "a path into `qa/acceptance/`". **No item has ever set
  it.** It is precisely the missing input for verifier rung 3, which is why rung 3 could not exist.
- §7.6 lists a weekly "roadmap proposal" loop. Nothing produces it.

That turned into the test now written down: *draw an edge when the schema declares it and nothing
traverses it.* It kept two more candidates out — `Request.roadmap` and `Goal.current` both dangle,
but each has one use, and extract-on-the-second-use applies to edges too.

The general lesson: when a spec asks for something new, check whether a past self already reserved
a place for it. Twice out of three, the concept was anticipated and only the path was missing.

## Deciding verifiers-as-concept vs. the QA folder

The spec left this to me. The deciding observation was that the four rungs already live in four
places, so a `verifiers/` directory would contain nothing but pointers. What was actually missing
was **vocabulary** — and the evidence for that is direct: with no word for "the thing that checks
the doer", nobody had noticed for two months that rung 3 had no input. Naming the stack surfaced
the gap in the same afternoon.

## A dead end: the assess step as a prompt

The spec specifies the heartbeat's assess step as a prompt, and I started writing it that way.
Killed it. That design makes the heartbeat unrunnable without a credential (which does not exist),
untestable in CI, dead at the first billing failure, and non-deterministic in a job that runs
unattended twice a day. Every input it needs — priority, goal status, claim age, ceiling headroom —
is sitting in git.

So assess became a ranking function with an optional model second opinion. The practical payoff is
that MO-050 ships and runs before any API key exists, which was the point of asking about
credentials at intake.

## What I did not do

Did not touch `hq/inbox/cpheinrich.md`, which has an unanswered reply from Chris on item 3 and
currently fails `inbox validate` — the known "committing your inbox replies would red CI" case.
Left for the inbox cycle at the end of the session rather than swept into a spec PR.
