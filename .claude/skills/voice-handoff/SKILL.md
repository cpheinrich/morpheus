---
name: voice-handoff
description: Package the current session for a voice conversation with Claude. Use when Chris says he wants to talk something through, think out loud, go for a walk and discuss, or asks for a voice handoff or brief. Generates local/handoffs/ and copies it to the clipboard.
---

# Voice handoff — out

Chris is leaving this session to think out loud with Claude in voice mode. A voice session starts
cold: it cannot read the repo, run the CLI, or see the board. Your job is to hand it everything it
needs in one paste, and nothing it does not.

## What the CLI already does

```sh
morpheus voice brief "<the topic, in his words>" --notes "<what just happened>"
```

That writes `local/handoffs/YYYY-MM-DD-<slug>.md` with the board state, open inbox items, what has
landed since the last handoff, and the closing instructions. **All of that is deterministic — do not
re-derive it by hand.**

## What you add

The `--notes` are yours, and they are the whole reason this is a skill rather than a command. The
board says what state the work is in; it cannot say what the last two hours were *about*. Write two
to five sentences covering:

- What was actually being worked on, in plain language
- Anything that turned out differently than expected
- The thing that is unresolved and worth thinking about — which is usually why he is going to voice
  in the first place

Write them for someone who was not here. Names of items mean nothing without a sentence of what they
are.

## Steps

1. **Ask for the topic if it is not obvious.** One line, his words. If he has just been talking
   about something, use that and say what you used rather than asking.
2. `morpheus voice brief "<topic>" --notes "<your narrative>"`.
3. `pbcopy < <the path it printed>` so it is on the clipboard.
4. Tell him: it is copied, paste it into a chat in his Morpheus project on claude.ai, then hit the
   voice-mode button.

## The first time, or after a convention changes

```sh
morpheus voice knowledge
```

Writes `local/voice/knowledge.md` — the standing explainer. He uploads it **once** as project
knowledge; it is not per-session. Suggest this only if `local/voice/knowledge.md` is missing or a
convention has changed since it was written. Re-uploading it every session defeats the split that
keeps the brief short.

If he wants a self-contained paste for a chat outside the project, `--full` inlines the explainer.

## What not to do

- **Do not summarise the board in prose.** It is already in the brief, and a second version
  disagrees with the first the moment either changes.
- **Do not include code.** A voice session cannot act on it, and it crowds out the conversation.
- **Do not pre-decide the thing he is going to talk about.** Notes say what is unresolved. They do
  not say what the answer is — that is what the conversation is for, and a brief that argues a
  position gets it agreed with rather than examined.
