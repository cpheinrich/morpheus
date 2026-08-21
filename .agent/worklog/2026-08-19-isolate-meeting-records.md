---
date: 2026-08-19
agent: codex
roadmap: MO-26-08-19-21.30.27
outcome: shipped
summary: Made the factual meeting record independently reviewable from every downstream interpretation.
---

## Why the boundary belongs in four places

The architecture owns the records model, `AGENTS.md` owns contributor behavior, the Morpheus
meeting-notes README owns the canonical procedure, and the initializer carries the concise local
gate into downstream projects. Leaving the rule only in the long canonical README would make it
easy to miss at the moment an agent assembles a pull request; copying the full procedure into every
project would recreate the drift the existing short scaffold intentionally avoids.

## Scope kept out

No Lakina file changed. This change does not automate enforcement or reinterpret any meeting; it
makes the delivery boundary explicit and adds one scaffold regression assertion.

## Review findings

The first version left the later `roadmap:` backfill implicit, placed the contributor rule beside
the claimed-branch waiver rather than the records-only branch convention, and split the existing
redaction decision from its public-repo continuation. Agent review caught all three. The final rule
names the unclaimed `inbox-<YYYY-MM-DD>` branch, treats roadmap-id backfilling as bookkeeping, and
keeps the older decision intact.
