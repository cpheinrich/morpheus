---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-023
outcome: shipped
summary: Refresh regenerates derived files and names seeded ones instead of reporting success over a stale mission.
---

## The bug

Codex found it in issue #12. `generateBrand` always rewrote `answers.json` and skipped every other
existing file, so a refresh could change the mission in the answers while `messaging.json` kept the
old one — and `messaging.json` is imported by the web app, so the stale value shipped. The command
printed success.

The non-destructive rule was right. Treating every file identically was not.

## The distinction that fixes it

Three owners, not one:

- **derived** — a pure function of the answers. Nothing hand-written survives in it legitimately,
  so regenerate without asking.
- **seeded** — generated once as a starting point, then human-owned. Report the disagreement.
- **authored** — the session's output. Never touch.

## The judgement worth recording

**Morpheus does not revert prose to close a gap it noticed.** The tempting fix was to regenerate
`strategy.md` too, since it is generated from the answers. But someone may have improved it, and
silently reverting their writing is the same class of bug as silently keeping a stale mission — a
tool overwriting a decision it did not make. So seeded files get named and the human resolves it.
Deleting the file and re-running is the escape hatch, which is explicit and cheap.

## Also

`brand check` reads `answers.json` rather than asking questions, which is what makes it usable in
CI and on a package someone else refreshed.
