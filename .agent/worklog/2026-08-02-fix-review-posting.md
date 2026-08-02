---
date: 2026-08-02
agent: claude
roadmap: MO-26-08-02-02.34.24
outcome: shipped
summary: Rung 2's first live run reviewed a PR, was denied nine times trying to post, and exited green — the exact failure mode the rung was designed to prevent, in the one state nobody enumerated.
---

## What happened

The key landed and I did what I said I would: opened a real PR rather than declaring the rung
working. `agent-review / review  pass` in **3m48s**, against ~20s while it was skipping.

Then I went looking for the review and there wasn't one. No PR comment, no review, nothing in the
inline-comment API.

The timing was the tell. A step that takes eleven times longer and produces nothing has done
something, and the log said what:

```
"num_turns": 20, "total_cost_usd": 0.86167775, "permission_denials_count": 9
```

## The uncomfortable part

MO-051's central argument was that **an unconfigured verifier must not report success**, because a
green check is read as evidence. I built the skip path carefully around that — job summary, warning
annotation, explicit "green means skipped, not passed".

And then shipped a state I had not enumerated: configured, running, and mute. It looks *healthier*
than the skip, because the warning annotation is gone too. The rung failed in exactly the way it
existed to prevent, one layer further out than I had looked.

Worth being blunt about, because the mistake was not the missing config line — that is a
five-minute fix. It was that I checked "does it run" and treated that as "does it work", on a
component whose entire job is to report.

## Why it happened, mechanically

Passing `prompt` puts `claude-code-action` into automation mode, which by design creates no tracking
comment and grants the base GitHub tools but not the ones that write to a PR. The action's own
`examples/pr-review-comprehensive.yml` passes `track_progress: true` and an explicit `--allowedTools`
list. I wrote the workflow against the interface with no key to exercise it, and the untested half
was the half that mattered.

Notably I *had* looked up the action's inputs when building MO-051, and got `prompt`,
`anthropic_api_key`, `github_token` and the permissions right. The docs page I read did not cover
mode behaviour. Reading one page and stopping is what left the gap.

## The cost question I deliberately did not answer

$0.86 for a pull request containing **no code**, on `claude-opus-5[1m]` because that is the default
and no model was pinned. Pinning a cheaper model is one line and I did not do it: it is a
quality-for-money trade that is Chris's, and burying it inside a bug fix would hide a decision worth
making explicitly. Raised in the inbox instead.

## The guard

`--max-turns 40` as a runaway backstop, chosen deliberately *above* the 20 turns a code-free PR
consumed. A cap set near observed usage would truncate a real review just before it posts — trading
a loud bug for a quiet one.
