---
name: meeting-intake
description: Distill Gemini-generated meeting notes into reviewed repository records, deduplicate Gmail, Calendar and Docs sources, regenerate an optional discovery catalog, and gate any authorized completion notice. Use for Gemini notes, meeting-note intake, meeting catalogs, historical meeting backfills, or finding prior meeting context.
---

# Meeting intake

Run `morpheus meeting-intake guide` and follow it. Morpheus owns the deterministic schema,
immutable Git reader, deduplication, bounded search, optional projection and notice gate. The
project's `.morpheus/meeting-intake.json` owns its people, topics, canonical repository,
destinations, timezone and notification authority.

Historical imports are notes only: never create or replay actions or send completion notices from
them. A factual note gets its own pull request; interpretation and action promotion stay separate.
New factual notes use the guide's versioned priority-first structure: executive summary, key
decisions and key action items before detailed discussion.

If `morpheus meeting-intake` is unknown, run `morpheus self update`.
