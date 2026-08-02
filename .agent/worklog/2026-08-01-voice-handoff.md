---
date: 2026-08-01
agent: claude
roadmap: MO-26-08-01-17.28.41
outcome: shipped
summary: Voice handoffs both directions; the two bugs that mattered were found by running the thing for real, not by writing tests.
---

## The question that shaped it

Chris asked whether an interactive voice session can live inside a Project — because if it can,
handoffs only need the delta, and if it cannot, they need the whole project explained every time.

The help docs say voice mode "is not [available] in Claude Cowork and Code" and so "will not be able
to reference the projects and skills you have set up in Cowork", which reads like a no. It is not:
that sentence is about running voice *as Cowork*, with its agentic tooling. I opened claude.ai, went
into a project, and the composer has a `"Use voice mode"` button whenever the Chat/Cowork toggle is
on Chat.

**What I could not verify** is whether project knowledge actually reaches the voice conversation.
The wording genuinely admits both readings and I was not going to assert one.

So I built the split that is right either way: static explainer in project knowledge, live state
pasted per session. If the knowledge reaches voice, the brief stays short. If it does not, `--full`
inlines the explainer. The design stopped depending on the answer, which was better than guessing it.

## Two bugs, both found by running it rather than testing it

**`git log --since=2026-08-01` returned nothing on a day with sixteen merged PRs.** Git's approxidate
fills a bare `YYYY-MM-DD` with the *current time of day*, not midnight — so at 17:28 the window
started at 17:28 and hid the entire working day. The brief cheerfully reported "nothing has landed
since the last handoff". Fixed by passing `00:00:00` explicitly.

This one is worth remembering because every unit test I would have written would have passed: the
function did exactly what it said, and what it said was wrong about git.

**The handoff was dated a day ahead of the item it belonged to.** `toISOString().slice(0,10)` is UTC,
and at 17:28 Pacific it is already tomorrow — so `MO-26-08-01-17.28.41` produced
`2026-08-02-voice-handoff.md`. The repo had already decided ids use a fixed Pacific zone precisely
so ordering means something; the fix was to export `isoDateInZone` from `id.ts` and share the one
`ZONE` constant rather than introduce a second one.

Both surfaced within a minute of the first real run, and neither would have surfaced from the tests I
had planned.

## Why out is a command and back is a skill

The asymmetry took a moment to see, and building them the same way would have made one of them wrong.

Generating a brief is entirely deterministic — the board, the open inbox items, the commits since the
last handoff. It belongs in the CLI, where it is testable and where every scaffolded project gets it
for free. The only thing a model adds is the session narrative, which is why `--notes` exists and why
the skill is thin.

Ingesting a returning spec is the opposite. The spec was written by something that could not see the
codebase, so the entire job is checking it against reality: what already exists, what contradicts a
settled decision, which premise is simply false. No command can do that. And a skill that *also*
hand-derived the board state would drift from the CLI's version of it.

## What I deliberately did not do

- **No `init` scaffolding for `local/handoffs/`.** `local/` is already in the scaffolded
  `.gitignore`, and the CLI creates the directory on demand. Scaffolding an empty gitignored
  directory would create nothing git could track.
- **The skills stay Morpheus-only for now.** The *capability* reaches every project through the CLI
  immediately. Shipping the skill files into scaffolded repos is a distribution question with one
  use so far, and *extract on the second use* applies.
