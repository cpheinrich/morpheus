---
date: 2026-08-01
agent: claude
roadmap: MO-051
outcome: shipped
summary: Rung 2 ships with everything except the model call testable; RoadmapItem.acceptance is finally traversed, by the first item ever to set it.
---

## What was actually buildable without a credential

The whole thing except one step. The reviewer's value is concentrated in *what it is told*, not in
the API call — so the persona is a versioned file, the prompt assembly is a tested module, and the
workflow's model step is four lines of YAML pointing at `anthropics/claude-code-action@v1`.

I looked the action's interface up rather than recalling it. `prompt`, `anthropic_api_key`,
`github_token`, and `permissions: contents: read / pull-requests: write`. Worth the one fetch —
getting an input name wrong would have produced a workflow that fails only once a key exists, which
is the worst possible time to discover it.

## The GitHub Actions trap

`secrets` is **not available in a step-level `if`**. Written the obvious way —
`if: ${{ !secrets.anthropic_api_key }}` — the expression silently evaluates to false and the review
step never runs *even when configured*. A verifier that never runs and never says so, which is
precisely the failure this rung is supposed to be immune to, in the rung itself.

Resolved once into a job-level `env: HAS_KEY`, with a test asserting no `if:` in that file
references `secrets.`.

## The dangling edge, closed

`RoadmapItem.acceptance` has existed since MO-001 and **no item had ever set it**. MO-051 is the
first, and `qa/acceptance/MO-051.md` is the first file in that directory. So the edge MO-048
identified is now traversed by real data rather than by a test fixture.

The distinction that took thought: a declared-but-missing acceptance file is a *defect*, not an
absence. Treating it as "no criteria" is exactly how the field stayed dead — nothing ever complained,
because nothing ever looked. Same family as the `RM-` regex in MO-049 and the three dangling edges
in MO-048. Three instances in one day of the same shape: **a field nobody reads cannot be observed
to be broken.**

Related, and the reason the conformance section is omitted rather than rendered empty: an empty
heading tells the reviewer there are no criteria to meet, which is a much stronger claim than no
criteria were stated, and a reviewer told the former stops looking.

## What the persona is deliberately told not to do

Most of the writing effort went into subtraction. Rung 1 has already passed by the time rung 2
runs, so the persona is told not to repeat it — a review that reports missing tests CI would have
caught is noise, and noise is how a review stage gets bypassed. It is also told not to restate the
diff, not to manufacture findings to look thorough, and not to hedge, since it does not block
anything and hedging to be safe buys nothing.

The highest-value instruction is to read `.agent/decisions.md`. **No test encodes a decision**, so a
PR quietly reversing one is invisible to every other rung.

## Not done

The model call is untested, because there is nothing to test it against. Documented as the
prerequisite rather than stubbed — a stub that "passes" would be the unconfigured-verifier failure
wearing a different hat.
