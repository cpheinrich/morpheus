# 2026-07-29 — Primitives only, decided (MO-045)

## What was asked and what came back

Three inbox cycles asked the same question: does the semantic token layer belong in the kit or in
each project? The first two came back with an empty `~`.

Third time I stopped asking it as an open question and attached a recommendation with the reason —
*extract on the second use, never the first*, and the semantic layer has exactly one use — plus a
one-word way to answer. Chris: "Ok we can do primitives only."

Worth noting for next time: **a question asked three times is not a question, it is a question
posed badly.** The content did not change between the second and third asking; what changed was
that the third had a default and a reason, so answering cost a word instead of a decision.

## What actually changed

Almost nothing in behaviour. `src/design/tokens.ts` already emitted primitives and already said
so. But it said so like this:

> It deliberately does **not** decide semantic names: only one of the three projects has a
> semantic layer, its mapping is bespoke, and inventing a shared vocabulary from a sample of one
> would be guessing.

That reads as a placeholder — a thing waiting for more data. It is now a decision with a date, and
the same statement is in `.agent/decisions.md` and §15.1a.

§15.1a needed the least work: its table *already* assigned the semantic layer to
`packages/shared/tokens/semantic.json` per project. The open question was whether the kit should
take it back with a per-project mapping file. It should not, and §15.1a now says so rather than
leaving the reader to infer it from a table.

## Why tests for a decision

Because the failure mode is social, not logical. Nobody will delete the primitives-only behaviour;
somebody will *add* `--action-primary` one day because a project needed it and the kit was right
there. Three tests now assert the generator emits exactly the names the brand file declares and no
aliases — including a count assertion, so an addition fails rather than passing silently
alongside the existing expectations.

A vocabulary is worse to get wrong than a function: everything downstream is written against the
names, so a wrong one cannot be refactored away in a single place.

## Follow-on

MO-004 (`/hq` auth), MO-005 (dashboard shell) and MO-006 (analytics) were blocked on the kit
having agreed content. They are unblocked. Not started here — each is its own item and its own
session.
